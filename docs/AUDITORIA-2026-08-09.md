# Auditoria técnica — SISTEN

**Data:** 2026-08-09 · **Escopo:** código-fonte, estrutura de arquivos, dependências e banco Supabase (`fwezzgduywgyhxinjurn`).

Base medida: ~51.000 linhas de TypeScript/TSX em 129 arquivos; 79 testes passando; `tsc --noEmit` limpo; build de produção OK.

---

## 1. Vulnerabilidades

Ordenadas por severidade. As três primeiras são exploráveis apenas com a chave `anon`, que é
pública por design (está no bundle JS servido a qualquer visitante).

### 🔴 CRÍTICO — Escalada de privilégio via `profiles`

A política `profiles_update_self` permite que o usuário atualize a própria linha sem restrição
de coluna, e não existe trigger protegendo a coluna `roles`:

```sql
-- política atual
USING      ( auth.uid()::text = id OR has_role('admin') )
WITH CHECK ( auth.uid()::text = id OR has_role('admin') )
```

`has_role()` lê exatamente `profiles.roles`. Logo, qualquer usuário autenticado — inclusive um
recém-cadastrado, que entra como `visualizador` — pode executar
`update profiles set roles = '{admin}' where id = auth.uid()` e virar admin, ganhando acesso a
todos os módulos, aos dados de uso e à escrita em `materials`, `pedidos`, `sectors` etc.

*(Verificado estruturalmente por inspeção de políticas e triggers; nenhum exploit foi executado.)*

**Correção:** bloquear a alteração de `roles`/`status` por não-admin.

```sql
-- Revoga a coluna do papel authenticated; admin passa a alterar via RPC dedicada.
REVOKE UPDATE (roles, status) ON public.profiles FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.admin_set_roles(p_user_id text, p_roles text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT has_role('admin') THEN RAISE EXCEPTION 'acesso negado'; END IF;
  UPDATE public.profiles SET roles = p_roles WHERE id = p_user_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_set_roles(text, text[]) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.admin_set_roles(text, text[]) TO authenticated;
```

Depois, ajustar o AdminPanel para chamar a RPC em vez de dar `update` direto em `profiles`.

### 🔴 CRÍTICO — Três tabelas sem RLS e com grants totais para `anon`

`public.ipca_indice`, `public.cidadeforn` e `public.cnpj_forn` estão com RLS **desligada** e com
`SELECT, INSERT, UPDATE, DELETE, TRUNCATE` concedidos ao papel `anon`. Qualquer pessoa na
internet, sem login, pode ler a base de CNPJs de fornecedores e **apagar** ou adulterar as três
tabelas — inclusive o índice IPCA que alimenta a auditoria de preços.

```sql
ALTER TABLE public.ipca_indice ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cidadeforn  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cnpj_forn   ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ipca_indice, public.cidadeforn, public.cnpj_forn FROM anon;

-- leitura para quem está logado; escrita só para os papéis de suprimentos
CREATE POLICY leitura_autenticada ON public.ipca_indice
  FOR SELECT TO authenticated USING (true);
CREATE POLICY escrita_suprimentos ON public.ipca_indice
  FOR ALL TO authenticated
  USING      (has_role('admin') OR has_role('coordenador_suprimentos'))
  WITH CHECK (has_role('admin') OR has_role('coordenador_suprimentos'));
-- repetir para cidadeforn e cnpj_forn
```

`public.dataset_versions` tem RLS ligada mas **nenhuma política** — hoje isso a torna
inacessível para todos; confirme se é intencional ou se falta a política.

### 🔴 CRÍTICO — `tabela_frete` aberta ao papel `public`

As quatro políticas de `tabela_frete` (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) foram criadas para
`TO public`, o que inclui `anon`. Efeito idêntico ao item anterior: leitura e escrita sem login.

```sql
DROP POLICY "Permitir leitura total para tabela_frete"    ON public.tabela_frete;
DROP POLICY "Permitir inserção total para tabela_frete"   ON public.tabela_frete;
DROP POLICY "Permitir atualização total para tabela_frete" ON public.tabela_frete;
DROP POLICY "Permitir exclusão total para tabela_frete"   ON public.tabela_frete;
REVOKE ALL ON public.tabela_frete FROM anon;

CREATE POLICY frete_leitura ON public.tabela_frete FOR SELECT TO authenticated USING (true);
CREATE POLICY frete_escrita ON public.tabela_frete FOR ALL TO authenticated
  USING      (has_role('admin') OR has_role('coordenador_suprimentos'))
  WITH CHECK (has_role('admin') OR has_role('coordenador_suprimentos'));
```

O mesmo padrão `TO {anon,authenticated}` aparece em `cadastro_tipodoc`,
`cadastro_tipodoc_fbl1n`, `ddp` e `impostos` — só leitura, impacto menor, mas devem virar
`TO authenticated`.

### 🟠 ALTO — Chaves de IA embutidas no bundle público

[src/components/admin/AdminChatbot.tsx:29-32](../src/components/admin/AdminChatbot.tsx#L29-L32) e
[src/views/TesteExtracaoIA.tsx:43-44](../src/views/TesteExtracaoIA.tsx#L43-L44) leem
`VITE_OPENROUTER_API_KEY`, `VITE_GEMINI_API_KEY` e `VITE_GEMINI_API_KEY_2`. Toda variável `VITE_`
é substituída literalmente no JavaScript gerado — as chaves estão em texto puro em `dist/` e
podem ser extraídas por qualquer usuário e usadas até estourar a cota da conta.

**Correção:** mover as chamadas de IA para uma Edge Function (já existe `supabase/functions/`),
guardar as chaves como *secrets* do Supabase e fazer o frontend chamar a função com o JWT do
usuário. Depois, **revogar e reemitir** as chaves atuais — elas devem ser tratadas como
comprometidas.

### 🟠 ALTO — `service_role` no `.env` de desenvolvimento

O `.env` local guarda a chave `service_role`, que ignora toda RLS. O arquivo está corretamente
no `.gitignore` e não está no histórico do git (verificado), mas convive no mesmo diretório de
uma pasta sincronizada pelo OneDrive. Ela não é usada por nenhum código do `src/`.
**Recomendação:** remover do `.env`, rotacionar a chave e mantê-la só nos secrets do Supabase.

### 🟠 ALTO — `xlsx` com vulnerabilidades sem correção no npm

`npm audit` reporta 8 vulnerabilidades, 5 de severidade alta. A relevante:
`xlsx@0.18.5` tem *Prototype Pollution* (GHSA-4r6h-8v6p-xvw6) e *ReDoS* (GHSA-5pgg-2g8v-p4x9),
**sem correção disponível no registro npm**. O pacote é usado em 15 arquivos para importar
planilhas SAP — ou seja, processa arquivo enviado pelo usuário, que é exatamente o vetor.

**Correção:** migrar para a distribuição oficial mantida (`https://cdn.sheetjs.com/xlsx-0.20.x/`,
via `npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`), que corrige ambas.

### 🟡 MÉDIO — Senha padrão fixa no cadastro

[src/db/localDb.ts:1109](../src/db/localDb.ts#L1109) usa `password || 'ten123'` como fallback no
signup. Contas criadas sem senha explícita ficam com credencial conhecida e adivinhável.
Troque por senha aleatória + e-mail de definição de senha (`resetPasswordForEmail`, já
implementado na linha 1159).

### 🟡 MÉDIO — Proteção contra senhas vazadas desligada

O Supabase Auth pode checar senhas contra o HaveIBeenPwned. Está desabilitado.
Ative em *Authentication > Policies*, junto com um mínimo de comprimento.

### 🟡 MÉDIO — `has_role()` com `search_path` mutável

`has_role()` é `SECURITY DEFINER` sem `SET search_path`, e é a base de praticamente toda decisão
de autorização do banco. Um objeto criado num schema que apareça antes de `public` no
`search_path` do chamador pode sequestrar a resolução de `profiles`.

```sql
ALTER FUNCTION public.has_role(text) SET search_path = public, pg_temp;
```

O mesmo vale para `sync_cnpj_forn_from_pedidosforn`, `ipca_mes_referencia` e `ipca_fator`.

### 🟡 MÉDIO — 12 views `SECURITY DEFINER` e 4 materialized views expostas

`vw_demandas`, `view_enriched_requisicoes`, `view_enriched_pedidos`, `vw_materials_stats`,
`vw_historico_pedidos`, `vw_requisicoes_decorada`, `vw_estoque_decorado`,
`vw_pedidosforn_decorado`, `vw_pedidos_decorado`, `vw_historico_fornecedores_sem_po`,
`vw_auditoria_compras` e `vw_auditoria_historico_material` rodam com as permissões do criador,
contornando a RLS das tabelas base. Como a RLS de `requests` é a única que filtra por usuário,
`vw_demandas` e `view_enriched_requisicoes` podem estar expondo solicitações que o usuário não
veria pela tabela.

```sql
ALTER VIEW public.vw_demandas SET (security_invoker = on);  -- Postgres 15+
```

As materialized views `mv_pedido_atual_por_ri`, `mv_material_sinais`, `mv_historico_pedidos` e
`mv_benchmark_material` não aceitam RLS; se contêm dado sensível, revogue de `anon` e exponha
por uma view comum com `security_invoker`.

### 🟡 MÉDIO — 14 funções `SECURITY DEFINER` executáveis por `anon`

Inclui `usage_kpis`, `usage_user_timeline`, `usage_page_users`, `usage_active_user_list`,
`bump_dataset_version` e `refresh_historico_pedidos`. Um visitante sem login pode extrair
métricas de uso e nomes de usuários, e forçar `REFRESH MATERIALIZED VIEW` repetidamente (carga
no banco). Note que `_usage_require_admin` existe justamente para barrar isso — mas as funções
`usage_*` continuam com `EXECUTE` para `anon`.

```sql
REVOKE EXECUTE ON FUNCTION public.usage_kpis(timestamptz, timestamptz) FROM anon, public;
-- repetir para as demais usage_*, bump_dataset_version e refresh_*
```

### 🟢 BAIXO — Extensões no schema `public`

`pg_trgm` e `unaccent` instaladas em `public`. Mova para um schema `extensions` dedicado.

---

## 2. Oportunidades de melhoria

### Arquitetura

**`src/db/localDb.ts` tem 6.704 linhas e 129 métodos públicos numa única classe.** É 13% da base
de código em um arquivo, sem nenhum teste — mistura autenticação, cache IndexedDB, migração de
`localStorage`, importação SAP, solicitações, contratos, estoque e helpdesk. Qualquer alteração
carrega risco de regressão em domínios não relacionados, e a classe é o gargalo de qualquer
trabalho paralelo.

Sugestão: dividir por domínio mantendo a API pública atual como fachada de compatibilidade
(`src/db/repositories/auth.ts`, `requests.ts`, `materials.ts`, `suprimentos.ts`, `estoque.ts`,
`helpdesk.ts` + `src/db/cache.ts`). Feito de forma incremental — mover um domínio por commit e
reexportá-lo de `localDb.ts` — não quebra nenhum consumidor.

**Views grandes demais.** `SuppliersNoPO.tsx` (2.751 linhas), `AdminPanel.tsx` (2.279),
`NewRequest.tsx` (1.877), `SapPanel.tsx` (1.842) e `Fornecedores.tsx` (1.622). O padrão de
`src/components/suprimentos/` (abas extraídas em `Tab*.tsx`) já resolve isso bem — vale aplicar
o mesmo às cinco.

**Autorização é apenas client-side.** [src/lib/pages.ts](../src/lib/pages.ts) é uma boa fonte
única de verdade para menu e gate de rota, mas roda no navegador: quem editar o objeto `profile`
em memória, ou chamar o PostgREST direto, contorna tudo. A defesa real precisa estar na RLS
(seção 1). O gate de UI deve ser tratado como conveniência, não como controle de acesso.

### Qualidade

- **Rigor de tipos:** `strict` estava desligado por completo. Já ativei seis flags que passam com
  zero erros. Faltam `noImplicitAny` (~29 erros), `strictFunctionTypes` (~18, todos em formatters
  do Recharts) e `strictNullChecks` (~7) — **54 erros no total** para `"strict": true`, o que é
  um esforço de poucas horas e vale muito, dado que há 282 ocorrências de `any`/`as any`.
- **Não há ESLint nem Prettier.** Sem regras automatizadas, `react-hooks/exhaustive-deps` (a
  classe de bug mais comum em React) passa silenciosa. Sugiro `eslint` + `typescript-eslint` +
  `eslint-plugin-react-hooks`, começando com tudo em `warn`.
- **Cobertura de testes concentrada.** 79 testes, todos em 6 arquivos de `src/lib/`. Os módulos
  puros de maior risco financeiro — `historicoAnalytics.ts` (697 linhas), `suprimentos.ts` (543),
  `almoxarifado.ts` (365), `rastreio.ts` (300) — não têm nenhum. São funções puras, portanto
  baratas de testar.
- **Sem CI.** Nada garante que `npm run check` rodou antes de um merge. Um workflow do GitHub
  Actions com `lint` + `test` + `build` fecha isso.
- **`supabaseClient` retorna `null as any`** quando falta configuração
  ([src/db/supabaseClient.ts:14](../src/db/supabaseClient.ts#L14)), transformando um erro de
  configuração num `TypeError` obscuro em runtime, longe da causa. Melhor lançar na inicialização.

### Performance

O bundle inicial é de **665 kB** (185 kB gzip), acima do limite de aviso do Vite. Os maiores
pesos: `xlsx` (425 kB) e `recharts`/`CartesianChart` (344 kB).

- `xlsx` só é necessário nas telas de importação/exportação — carregar por `import()` dinâmico
  no momento do clique tira 425 kB do caminho crítico.
- O code-splitting por rota via `lazy()` já está bem feito em `App.tsx`; o ganho restante está em
  `manualChunks` separando `recharts` e `@supabase/supabase-js` do chunk principal.

### Acessibilidade e SEO

`index.html` está bem cuidado (idioma, viewport, theme-color, Open Graph, `noindex` correto para
sistema interno). Falta apenas `<meta name="color-scheme" content="light dark">` para evitar
flash de tema.

---

## 3. O que pode ser eliminado

### Já removido nesta sessão

| Item | Motivo |
| --- | --- |
| `old/LoginScreen.tsx`, `old/RegisterScreen.tsx` | Código morto, não importado por ninguém |
| `assets/.aistudio/.gitignore` | Resíduo do scaffold do Google AI Studio |
| 8 dependências não usadas | Detalhe abaixo |

Dependências removidas do `package.json`, nenhuma com import no código (`build` e testes
verificados após a remoção): `express`, `@types/express`, `dotenv`, `esbuild`, `autoprefixer`,
`exceljs`, `@google/genai`, `react-router-dom`, `tsx`. Além disso, `vite`,
`@vitejs/plugin-react` e `@tailwindcss/vite` estavam em `dependencies` e foram movidos para
`devDependencies`, onde pertencem.

> `react-router-dom` merece nota: estava instalado mas nunca importado — o roteamento é próprio,
> via hash, em `App.tsx`. Não é um problema, mas explica a confusão de quem chega ao projeto;
> vale documentar (feito no README).

### Recomendado eliminar — precisa da sua decisão

| Item | Tamanho | Observação |
| --- | --- | --- |
| `graphify-out/` | **25 MB**, 484 arquivos | Saída de ferramenta de análise, já no `.gitignore`. Pode apagar do disco. |
| `.agents/` | **17 MB**, 817 arquivos | Definições de agentes genéricos (`game-developer`, `mobile-developer`, `seo-specialist`…) sem relação com o projeto. Está parcialmente versionado. |
| `dist/` | 6,5 MB | Artefato de build, já ignorado. Regenerável com `npm run build`. |
| `metadata.json` | 145 B | Manifesto do Google AI Studio. Remova se o deploy não passa mais por lá. |
| `skills-lock.json` | 2,5 KB | Lock de ferramenta de agente, não do app. |
| `.playwright-mcp/`, `.worktrees/`, `.superpowers/` | — | Diretórios de tooling; confirme que não há trabalho pendente antes de apagar. |
| `db/sql/data/remover_wellington_compradores.sql`, `adicionar_giulia_compradores.sql`, `adicionar_jamille_compradores.sql` | — | Scripts de dado pontual sobre pessoas específicas. Já aplicados; melhor virarem cadastro pela UI do que script versionado. |

Somando `graphify-out/` + `.agents/` + `dist/`, são **~48 MB** de peso morto no diretório — e é
uma pasta sincronizada pelo OneDrive, então isso também é banda e conflito de sincronização.

---

## 4. Reorganização aplicada

**36 scripts SQL soltos na raiz** foram movidos para uma hierarquia por tipo de objeto (via
`git mv`, então o histórico foi preservado):

```
db/sql/tables/     8 arquivos   (criar_tabela_X.sql  →  X.sql)
db/sql/views/      4 arquivos   (criar_view_X.sql    →  X.sql)
db/sql/functions/  6 arquivos
db/sql/alters/    15 arquivos   (inclui os 2 de migrations/, que foi eliminada)
db/sql/data/       3 arquivos
```

**Documentação unificada.** Havia duas pastas paralelas com o mesmo propósito, `docs/` (17
arquivos) e `documentos/` (16) — a segunda foi fundida na primeira, sem colisões. `DESIGN.md` e
`plan.md`, que estavam na raiz, foram para `docs/referencia/`.

A raiz caiu de **63 para 15 entradas**.

**Arquivos criados/reescritos:**

- `README.md` — era o boilerplate do Google AI Studio, apontando para um app do AI Studio e
  mandando configurar `GEMINI_API_KEY` num `.env.local` inexistente. Reescrito com stack real,
  mapa da estrutura, scripts e o aviso sobre o prefixo `VITE_`.
- `.env.example` — antes listava só `GEMINI_API_KEY` e `APP_URL` (nenhuma das duas usada pelo
  app) e omitia as variáveis do Supabase, que são obrigatórias. Reescrito, com separação
  explícita entre variáveis públicas e segredos de servidor.
- `db/README.md` — convenções de SQL, incluindo a regra de RLS obrigatória que teria evitado os
  três achados críticos.
- `package.json` — nome era `react-example`; agora `sisten`, com `description`, `engines` e um
  script `check` (`lint && test`). O script `clean` referenciava um `server.js` inexistente.
- `tsconfig.json` — seis flags de rigor ativadas, com comentário registrando o que falta para
  `strict` completo.

**Verificação:** `tsc --noEmit` limpo, 79/79 testes passando, `vite build` concluído — antes e
depois de cada mudança.

---

## 5. Ordem sugerida de ataque

1. **Hoje:** os três críticos do banco (escalada por `profiles`, RLS das 3 tabelas,
   `tabela_frete`). São ~30 linhas de SQL e fecham acesso irrestrito sem login.
2. **Esta semana:** rotacionar as chaves de IA e mover as chamadas para Edge Function; trocar a
   distribuição do `xlsx`; remover `service_role` do `.env`; senha padrão `ten123`.
3. **Próximas semanas:** `search_path` das funções, `security_invoker` nas views, revogar
   `EXECUTE` das `usage_*` para `anon`.
4. **Contínuo:** ESLint + CI; `strict` completo (54 erros); quebrar `localDb.ts` por domínio;
   testes nos módulos analíticos; `xlsx` em import dinâmico.
