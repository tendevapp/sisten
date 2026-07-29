# Busca de Material SAP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a busca no catálogo SAP — hoje `ilike '%termo%'` sem índice, 1398 ms medidos em 172.130 linhas — por uma busca indexada que encontra o item certo e mostra estoque, demanda em aberto e histórico de uso.

**Architecture:** Índice GIN trigram sobre uma coluna gerada que concatena `description` e `technical_text`. Uma materialized view pré-agrega os sinais de `estoque`, `vw_demandas` e `pedidos` por código de material. Uma RPC `buscar_materiais` faz o casamento por tokens e devolve material + sinais num payload só. O cliente ganha `lib/materiais.ts`, adotado no dropdown que já existe em `NewRequest.tsx`.

**Tech Stack:** Postgres 17 (Supabase), `pg_trgm`, `unaccent`, React 19, TypeScript 5.8, Vite 6, Vitest (introduzido por este plano).

## Global Constraints

- Projeto Supabase: `fwezzgduywgyhxinjurn`. Migrações via `apply_migration` com nome em `snake_case`, seguindo as 44 já aplicadas. **Não** criar `.sql` solto na raiz.
- Toda função SQL nova: `security invoker` e `set search_path = public`. O projeto já corrigiu isso uma vez (`vw_demandas_security_invoker`); não reintroduzir o problema.
- Código e comentários em **português**, seguindo o padrão de `src/lib/format.ts` e `src/lib/solicitacoes.ts`: cabeçalho com licença SPDX e um parágrafo explicando *por que* o módulo existe.
- Cores só por token de `src/styles/tokens.css` (`var(--ink-primary)`, `var(--brand)`, `var(--status-*)`). Nenhum hex cru, nenhuma classe Tailwind de cor fixa.
- `npm run lint` (`tsc --noEmit`) precisa passar limpo ao fim de cada tarefa.
- Meta de desempenho original: **p95 < 150 ms** na RPC. Medição real na Tarefa 5
  (amostras espaçadas ao longo de um dia, fora do efeito de cache quente
  pós-migração) deu **p95 ≈ 217 ms**, por pressão de cache do banco
  compartilhado — o índice GIN é usado corretamente em todos os planos. Meta
  aceita como **p95 ≈ 217 ms** por decisão do parceiro humano: ainda é ~6x
  mais rápido que os 1398 ms da busca antiga, e imperceptível com o debounce
  de 300 ms do formulário. Ver spec, seção da Tarefa 5.
- Egress importa (ver `otimizacao_egress.sql`): a RPC devolve colunas nomeadas, nunca `select *`.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `vitest.config.ts` *(criar)* | Configuração de teste isolada da build. Ambiente `node`, só lógica pura — sem JSX, sem DOM. |
| `src/lib/materiais.ts` *(criar)* | Cliente da busca: normalização do termo, chamada da RPC, tipos do resultado. Único lugar que sabe o formato da RPC. |
| `src/lib/materiais.test.ts` *(criar)* | Testes da lógica pura de normalização/tokenização. |
| `src/types.ts` *(modificar)* | Tipos `MaterialSinais` e `MaterialResultado`, junto do `Material` que já existe. |
| `src/views/NewRequest.tsx` *(modificar)* | Passa a consumir `buscarMateriais` e a exibir os sinais no dropdown. |
| Migrações Supabase | `materials_busca_trgm`, `mv_material_sinais`, `sectors_sap_area_code`, `rpc_buscar_materiais`. |

---

### Task 1: Infraestrutura de teste e normalização do termo

Introduz o Vitest (o projeto não tem test runner) junto do primeiro pedaço de lógica pura que precisa dele. A normalização vive no cliente porque a UI decide com ela: se vale consultar, se o termo é código ou texto, e quais tokens destacar no resultado.

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/materiais.ts`
- Test: `src/lib/materiais.test.ts`
- Modify: `package.json` (scripts + devDependency)

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  export type TipoTermo = 'codigo' | 'texto' | 'curto';
  export interface TermoNormalizado {
    tipo: TipoTermo;
    /** Termo sem acento, em caixa alta, espaços colapsados. */
    normalizado: string;
    /** Tokens não vazios do termo normalizado. Vazio quando tipo === 'curto'. */
    tokens: string[];
  }
  export function normalizarTermo(bruto: string): TermoNormalizado;
  ```

- [ ] **Step 1: Instalar o Vitest**

```bash
npm install -D vitest@^3
```

- [ ] **Step 2: Criar `vitest.config.ts`**

Config separada de `vite.config.ts` de propósito: a build do app carrega os plugins React e Tailwind, e estes testes são de lógica pura em Node. Misturar as duas faria o teste pagar por um pipeline que ele não usa.

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Configuração de teste, separada da build.
 *
 * Os testes deste projeto cobrem lógica pura (normalização de termo, recorte
 * por papel, validação) e rodam em Node, sem DOM. Carregar os plugins de
 * React e Tailwind de `vite.config.ts` só somaria custo sem servir a nada.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Adicionar os scripts em `package.json`**

Em `"scripts"`, junto de `lint`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: Escrever o teste que falha**

Crie `src/lib/materiais.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizarTermo } from './materiais';

describe('normalizarTermo', () => {
  it('quebra em tokens, em qualquer ordem, para casar descrição do SAP', () => {
    // O catálogo grava "PARAFUSO M12 SEXTAVADO"; a pessoa digita na ordem dela.
    expect(normalizarTermo('parafuso sextavado m12')).toEqual({
      tipo: 'texto',
      normalizado: 'PARAFUSO SEXTAVADO M12',
      tokens: ['PARAFUSO', 'SEXTAVADO', 'M12'],
    });
  });

  it('remove acento — o catálogo grava VALVULA, a pessoa digita válvula', () => {
    expect(normalizarTermo('válvula esfera').normalizado).toBe('VALVULA ESFERA');
  });

  it('colapsa espaço repetido e ignora borda', () => {
    expect(normalizarTermo('  luva   npt  ').tokens).toEqual(['LUVA', 'NPT']);
  });

  it('reconhece termo só de dígitos como código de material', () => {
    expect(normalizarTermo('10318').tipo).toBe('codigo');
  });

  it('preserva a fração, que é atributo real de tubulação', () => {
    expect(normalizarTermo('luva 1/2 npt').tokens).toEqual(['LUVA', '1/2', 'NPT']);
  });

  it('marca como curto o que não vale consultar', () => {
    // Um caractere casaria com meio catálogo; a UI não deve nem consultar.
    expect(normalizarTermo('l').tipo).toBe('curto');
    expect(normalizarTermo('   ').tipo).toBe('curto');
    expect(normalizarTermo('l').tokens).toEqual([]);
  });

  it('exige 4 dígitos para tratar como código', () => {
    // Abaixo disso o prefixo devolveria milhares de linhas sem utilidade.
    expect(normalizarTermo('103').tipo).toBe('curto');
    expect(normalizarTermo('1031').tipo).toBe('codigo');
  });
});
```

- [ ] **Step 5: Rodar o teste e confirmar que falha**

```bash
npm test
```

Esperado: FALHA com `Failed to resolve import "./materiais"` — o módulo ainda não existe.

- [ ] **Step 6: Escrever a implementação mínima**

Crie `src/lib/materiais.ts`:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Busca no catálogo de materiais SAP.
 *
 * O catálogo tem 172 mil linhas e descrições em SAP-ês abreviado
 * ("LUVA FM FM197 1/2\" NPT 300#"), onde quase-duplicatas só se distinguem
 * pelo texto técnico. A busca antiga era `ilike '%frase inteira%'` em
 * `description`, sem índice: 1398 ms por tecla, e não achava o item quando a
 * pessoa digitava os atributos fora da ordem do cadastro.
 *
 * A normalização abaixo é do cliente, e serve para a UI decidir: se vale
 * consultar, se o termo é código ou texto, e quais tokens destacar no
 * resultado. O casamento de verdade é da RPC `buscar_materiais`, que normaliza
 * de novo no banco — de propósito: regra de tela não é regra.
 */

export type TipoTermo = 'codigo' | 'texto' | 'curto';

export interface TermoNormalizado {
  tipo: TipoTermo;
  /** Termo sem acento, em caixa alta, espaços colapsados. */
  normalizado: string;
  /** Tokens não vazios do termo normalizado. Vazio quando `tipo` é 'curto'. */
  tokens: string[];
}

/** Abaixo disto a busca devolveria meio catálogo — não vale a consulta. */
const MIN_TEXTO = 2;
/** Prefixo de código curto demais devolve milhares de linhas sem utilidade. */
const MIN_CODIGO = 4;

export function normalizarTermo(bruto: string): TermoNormalizado {
  const normalizado = (bruto ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');

  const vazio = (tipo: TipoTermo): TermoNormalizado => ({ tipo, normalizado, tokens: [] });

  if (normalizado === '') return vazio('curto');

  if (/^\d+$/.test(normalizado)) {
    return normalizado.length >= MIN_CODIGO
      ? { tipo: 'codigo', normalizado, tokens: [normalizado] }
      : vazio('curto');
  }

  if (normalizado.length < MIN_TEXTO) return vazio('curto');

  return { tipo: 'texto', normalizado, tokens: normalizado.split(' ') };
}
```

- [ ] **Step 7: Rodar o teste e confirmar que passa**

```bash
npm test
```

Esperado: PASSA, 7 testes.

- [ ] **Step 8: Confirmar que o lint continua limpo**

```bash
npm run lint
```

Esperado: sem saída, código de saída 0.

- [ ] **Step 9: Commit**

```bash
git add vitest.config.ts package.json package-lock.json src/lib/materiais.ts src/lib/materiais.test.ts
git commit -m "test: vitest e normalizacao do termo de busca de material"
```

---

### Task 2: Índice de busca no catálogo

Coloca `technical_text` dentro do texto pesquisável e cria o índice trigram. É o que muda 1398 ms para dezenas de milissegundos e o que passa a distinguir as três "LUVA FM FM197 1/2\" NPT 300#".

**Files:**
- Migração Supabase: `materials_busca_trgm`

**Interfaces:**
- Consumes: nada.
- Produces: coluna `materials.busca_texto text` (gerada, `stored`); função `f_unaccent(text) returns text`; índices `materials_busca_trgm` e `materials_code_prefix`.

- [ ] **Step 1: Medir o estado atual, para ter linha de base**

Rode via MCP Supabase (`execute_sql`, projeto `fwezzgduywgyhxinjurn`):

```sql
explain analyze
select * from materials
where is_active and description ilike '%luva%'
order by material_code limit 8;
```

Anote o `Execution Time`. A referência do diagnóstico é **1398 ms**.

**Atenção para a comparação do Step 3:** `order by material_code limit 8`
muda o plano de consulta — o planejador pode preferir caminhar o btree de
`material_code` já ordenado, filtrando linha a linha, em vez de usar
qualquer índice de texto. Isso vale tanto para a consulta antiga quanto para
a nova, então **meça as duas formas** no Step 3: com e sem essa cláusula. A
forma sem `order by`/`limit` é a que se compara de verdade ao ganho do
índice; a forma com `order by material_code limit 8` existe só para não
comparar uma maçã com uma laranja quando o Step 3 usa a cláusula equivalente
à do Step 1.

- [ ] **Step 2: Aplicar a migração**

`apply_migration`, nome `materials_busca_trgm`:

```sql
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- unaccent() é STABLE, não IMMUTABLE, e coluna gerada exige IMMUTABLE.
-- Fixar o dicionário no wrapper é o que torna a imutabilidade verdadeira:
-- sem o primeiro argumento, o resultado dependeria do search_path.
create or replace function f_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
set search_path = public
as $$ select public.unaccent('public.unaccent', $1) $$;

-- O texto técnico entra na busca: é ele que separa quase-duplicatas.
-- "LUVA FM FM197 1/2\" NPT 300#" existe três vezes com descrições idênticas;
-- o que difere é GALVANIZADO FOGO vs SEM REVESTIMENTO e a norma dimensional.
alter table materials
  add column if not exists busca_texto text
  generated always as (
    f_unaccent(upper(coalesce(description, '') || ' ' || coalesce(technical_text, '')))
  ) stored;

create index if not exists materials_busca_trgm
  on materials using gin (busca_texto gin_trgm_ops);

-- Busca por prefixo de código, para o campo "Código SAP".
create index if not exists materials_code_prefix
  on materials (material_code text_pattern_ops);

analyze materials;
```

A coluna gerada reescreve as 172 mil linhas e o índice GIN leva algum tempo para construir. Isso é esperado.

- [ ] **Step 3: Verificar que o índice é usado e medir o ganho**

Duas medições, pelo motivo anotado no Step 1:

```sql
-- Forma A: comparável ao Step 1, mesma cláusula order by/limit. Serve para
-- registrar o ganho real numa consulta com essa forma — que pode não usar
-- o GIN em nenhum dos dois lados, e está tudo bem, desde que o número
-- registrado não seja atribuído ao índice.
explain analyze
select * from materials
where is_active and busca_texto like '%LUVA%'
order by material_code limit 8;

-- Forma B: sem order by/limit artificial — é a que de fato exercita o GIN,
-- e a forma mais próxima do que a RPC da Tarefa 5 vai executar.
explain analyze
select material_code, description
from materials
where is_active and busca_texto like '%LUVA%'
limit 20;
```

Esperado na Forma B: o plano contém `Bitmap Index Scan on materials_busca_trgm`. Se aparecer `Seq Scan`, **pare** — sem uso de índice o resto do plano não entrega o ganho.

Registre os dois tempos separadamente no relatório e no commit — **não** compare a Forma A do Step 1 com a Forma B daqui: são consultas de forma diferente, e a diferença mistura o efeito do índice com o efeito de menos colunas/sem ordenação.

- [ ] **Step 4: Verificar que o texto técnico agora distingue as quase-duplicatas**

```sql
select material_code, description
from materials
where busca_texto like '%LUVA%' and busca_texto like '%NPT%'
  and busca_texto like '%GALVANIZADO%'
limit 5;
```

Esperado: retorna `1031825` e `1453311` (galvanizados) e **não** `1031826` (sem revestimento) — que tem descrição idêntica.

- [ ] **Step 5: Registrar a medição**

Anote no corpo do commit o tempo antes e depois, medidos nos passos 1 e 3.

- [ ] **Step 6: Commit**

```bash
git commit --allow-empty -m "feat(db): indice trigram de busca em materials

Coluna gerada busca_texto (description + technical_text) com indice GIN
trigram, mais indice de prefixo em material_code.

Mesma forma de consulta (order by material_code limit 8), termo 'luva':
<ANTES> ms -> <FORMA_A> ms.
Sem order by artificial, forma que a RPC de fato usa: <FORMA_B> ms,
Bitmap Index Scan on materials_busca_trgm confirmado."
```

Substitua `<ANTES>`, `<FORMA_A>` e `<FORMA_B>` pelos números medidos nos Steps 1 e 3. O commit é vazio porque a mudança vive no banco; ele existe para o histórico do repositório registrar quando o índice entrou.

Não anuncie um fator de ganho único (como "223x"): as duas formas medem coisas diferentes, e um número só esconde qual delas de fato usou o índice.

---

### Task 3: Sinais de estoque, demanda e pedido

Pré-agrega numa materialized view os três sinais que hoje existem no banco e ninguém usa. Sem ela, cada tecla faria três joins.

**Files:**
- Migração Supabase: `mv_material_sinais`

**Interfaces:**
- Consumes: nada da Task 2 (independente).
- Produces: `mv_material_sinais(material_code text, qtd_estoque numeric, depositos text[], rms_12m int, ultima_rm date, areas text[], rms_sem_pedido int, rm_aberta text, pedido_aberto text, chega_em date)`; função `refresh_material_sinais()`.

- [ ] **Step 1: Conferir os nomes de coluna das três fontes**

Os nomes abaixo vieram do schema real, mas confirme antes de aplicar — uma coluna errada aqui só aparece como sinal vazio na UI, silenciosamente:

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (table_name = 'estoque' and column_name in ('material','quantidade','deposito')
    or table_name = 'pedidos' and column_name in ('material','doc_compra','dt_remessa','qtd_pedido','qtd_fornecida'))
order by table_name, column_name;

select column_name from information_schema.columns
where table_schema='public' and table_name='vw_demandas'
  and column_name in ('material','data_da_solicitacao','area_solicitante','pedido','requisicao_de_compra','eliminado');
```

Esperado: todas as colunas listadas existem.

- [ ] **Step 2: Aplicar a migração**

`apply_migration`, nome `mv_material_sinais`:

```sql
-- Três sinais que já existem no banco e que a busca nunca usou:
-- saldo no almoxarifado, demanda já aberta (RM sem pedido) e compra a
-- caminho (RM com pedido). Pré-agregados porque a busca roda por tecla.
create materialized view mv_material_sinais as
with saldo as (
  select material,
         sum(quantidade)              as qtd_estoque,
         array_agg(distinct deposito) as depositos
  from estoque
  where quantidade > 0
  group by material
),
demanda as (
  select material,
         count(*)::int                                   as rms_12m,
         max(data_da_solicitacao)                        as ultima_rm,
         array_agg(distinct area_solicitante)
           filter (where area_solicitante is not null)   as areas,
         count(*) filter (where pedido is null)::int     as rms_sem_pedido,
         min(requisicao_de_compra)
           filter (where pedido is null)                 as rm_aberta
  from vw_demandas
  where data_da_solicitacao > current_date - interval '12 months'
    and coalesce(eliminado, false) = false
  group by material
),
comprado as (
  select material,
         min(doc_compra) as pedido_aberto,
         min(dt_remessa) as chega_em
  from pedidos
  where qtd_fornecida is null or qtd_fornecida < qtd_pedido
  group by material
)
select m.material_code,
       s.qtd_estoque,
       s.depositos,
       d.rms_12m,
       d.ultima_rm,
       d.areas,
       d.rms_sem_pedido,
       d.rm_aberta,
       c.pedido_aberto,
       c.chega_em
from materials m
left join saldo    s on s.material = m.material_code
left join demanda  d on d.material = m.material_code
left join comprado c on c.material = m.material_code
where m.is_active;

-- Índice único é requisito do REFRESH CONCURRENTLY.
create unique index mv_material_sinais_code on mv_material_sinais (material_code);

-- Chamada no fim de cada importação de estoque, requisições ou pedidos.
create or replace function refresh_material_sinais()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  refresh materialized view concurrently mv_material_sinais;
end;
$$;
```

- [ ] **Step 3: Verificar que os sinais têm dado de verdade**

```sql
select count(*)                                      as linhas,
       count(qtd_estoque)                            as com_estoque,
       count(rms_12m)                                as com_historico_rm,
       count(rm_aberta)                              as com_rm_sem_pedido,
       count(pedido_aberto)                          as com_pedido_aberto
from mv_material_sinais;
```

Esperado: `linhas` na casa de 172 mil; `com_estoque` próximo de 2.052 (materiais distintos com saldo). Se `com_estoque` vier 0, o join de `estoque.material` com `materials.material_code` não está casando — investigue o formato do código antes de seguir.

- [ ] **Step 4: Verificar que o refresh concorrente funciona**

```sql
select refresh_material_sinais();
```

Esperado: executa sem erro. Se reclamar de índice único, o índice do passo 2 não foi criado.

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "feat(db): mv_material_sinais com estoque, demanda aberta e pedido a caminho"
```

---

### Task 4: Mapear setor do app para área SAP

O reforço "a sua área já pediu este item" depende de um mapeamento que não existe: `vw_demandas.area_solicitante` guarda códigos SAP de quatro letras e `sectors` só tem `id` e `name`.

**Files:**
- Migração Supabase: `sectors_sap_area_code`
- Modify: `src/types.ts` (interface `Sector`)

**Interfaces:**
- Consumes: nada.
- Produces: coluna `sectors.sap_area_code text`; campo `sap_area_code?: string` em `Sector`.

- [ ] **Step 1: Aplicar a migração**

`apply_migration`, nome `sectors_sap_area_code`:

```sql
alter table sectors add column if not exists sap_area_code text;

-- Só as correspondências diretas. ADMI, SEGE e SEGT ficam nulos de
-- propósito: o significado deles não foi confirmado com Suprimentos, e
-- adivinhar aqui produziria um sinal errado com cara de certo.
update sectors set sap_area_code = 'ALMO' where name = 'Almoxarifado';
update sectors set sap_area_code = 'MANU' where name = 'Manutenção';
update sectors set sap_area_code = 'ENGE' where name = 'Engenharia';
update sectors set sap_area_code = 'QUAL' where name = 'Qualidade';
update sectors set sap_area_code = 'TI'   where name = 'TI';
update sectors set sap_area_code = 'PROD' where name = 'Produção';
update sectors set sap_area_code = 'CONT' where name = 'Contabilidade';
update sectors set sap_area_code = 'SAUD' where name = 'Saúde';
```

- [ ] **Step 2: Verificar o resultado**

```sql
select name, sap_area_code from sectors order by sap_area_code nulls last;
```

Esperado: 8 setores mapeados, 8 com `null`.

- [ ] **Step 3: Refletir no tipo do cliente**

Em `src/types.ts`, na interface `Sector`, adicione o campo com o comentário do porquê:

```ts
  /**
   * Código de quatro letras da área no SAP (`ALMO`, `MANU`…), usado para
   * cruzar com `vw_demandas.area_solicitante` e dizer "sua área já pediu
   * este item". Nulo nos setores cuja correspondência não foi confirmada, e
   * em 31% das RMs a própria área vem vazia — por isso o sinal só aparece
   * quando há dado, e nunca como "0x".
   */
  sap_area_code?: string;
```

- [ ] **Step 4: Confirmar que o lint passa**

```bash
npm run lint
```

Esperado: sem saída, código de saída 0.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts
git commit -m "feat(db): sap_area_code em sectors para cruzar area das RMs"
```

---

### Task 5: RPC `buscar_materiais`

Junta tudo: casamento por tokens em qualquer ordem, prefixo de código, queda para similaridade quando não há resultado, e os sinais anexados — num payload só.

**Files:**
- Migração Supabase: `rpc_buscar_materiais`

**Interfaces:**
- Consumes: `materials.busca_texto` (Task 2), `mv_material_sinais` (Task 3).
- Produces: `buscar_materiais(termo text, area_usuario text default null, limite int default 20)` retornando as colunas listadas abaixo.

- [ ] **Step 1: Aplicar a migração**

`apply_migration`, nome `rpc_buscar_materiais`:

O prefiltro usa **o token mais longo** com `like '%tok%'`, e só depois aplica os demais tokens. O motivo é concreto: `LIKE ALL (array)` não é decomposto pelo planejador em condições indexáveis, e cairia em `Seq Scan` — enquanto um `LIKE '%tok%'` isolado usa o índice GIN trigram. O token mais longo é também o mais seletivo.

```sql
create or replace function buscar_materiais(
  termo         text,
  area_usuario  text default null,
  limite        int  default 20
)
returns table (
  material_code   text,
  description     text,
  technical_text  text,
  unit            text,
  qtd_estoque     numeric,
  depositos       text[],
  rms_12m         int,
  ultima_rm       date,
  rms_sem_pedido  int,
  rm_aberta       text,
  pedido_aberto   text,
  chega_em        date,
  pedido_pela_area boolean
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  norm     text;
  toks     text[];
  maior    text;
  eh_cod   boolean;
  teto     int := least(coalesce(limite, 20), 50);
begin
  norm := regexp_replace(trim(f_unaccent(upper(coalesce(termo, '')))), '\s+', ' ', 'g');
  if norm = '' then return; end if;

  eh_cod := norm ~ '^\d+$';
  toks   := array_remove(string_to_array(norm, ' '), '');

  -- Token mais longo primeiro: é o que o índice GIN vai usar.
  select t into maior from unnest(toks) t order by length(t) desc limit 1;

  -- coalesce obrigatório: `areas @> array[...]` devolve NULL quando `areas` é
  -- nulo, e NULL em ORDER BY DESC sobe primeiro. Sem isto, material sem
  -- histórico de área ficaria acima do que a área do usuário realmente pediu.
  return query
  select m.material_code, m.description, m.technical_text, m.unit,
         s.qtd_estoque, s.depositos, s.rms_12m, s.ultima_rm,
         s.rms_sem_pedido, s.rm_aberta, s.pedido_aberto, s.chega_em,
         coalesce(area_usuario is not null and s.areas @> array[area_usuario], false)
           as pedido_pela_area
  from materials m
  left join mv_material_sinais s on s.material_code = m.material_code
  where m.is_active
    and case
          when eh_cod then m.material_code like norm || '%'
          else m.busca_texto like '%' || maior || '%'
               and m.busca_texto like all (
                 select array_agg('%' || t || '%') from unnest(toks) t
               )
        end
  order by
    (coalesce(s.qtd_estoque, 0) > 0) desc,
    coalesce(area_usuario is not null and s.areas @> array[area_usuario], false) desc,
    coalesce(s.rms_12m, 0) desc,
    similarity(m.description, norm) desc,
    m.material_code
  limit teto;

  if found then return; end if;

  -- Nenhum resultado exato: tenta por similaridade, para tolerar erro de
  -- digitação ("rolamneto" -> ROLAMENTO). Fica fora do caminho principal
  -- porque `%` é mais caro que `like` e só vale quando o certo falhou.
  return query
  select m.material_code, m.description, m.technical_text, m.unit,
         s.qtd_estoque, s.depositos, s.rms_12m, s.ultima_rm,
         s.rms_sem_pedido, s.rm_aberta, s.pedido_aberto, s.chega_em,
         coalesce(area_usuario is not null and s.areas @> array[area_usuario], false)
           as pedido_pela_area
  from materials m
  left join mv_material_sinais s on s.material_code = m.material_code
  where m.is_active and m.description % norm
  order by similarity(m.description, norm) desc, m.material_code
  limit teto;
end;
$$;

grant execute on function buscar_materiais(text, text, int) to authenticated;
```

- [ ] **Step 2: Verificar tokens em qualquer ordem**

```sql
select material_code, description from buscar_materiais('luva npt galvanizado', null, 5);
```

Esperado: devolve galvanizados (`1031825`, `1453311`) e **não** o `1031826`, que é "sem revestimento" apesar da descrição idêntica. Isto é o que a busca antiga não fazia.

- [ ] **Step 3: Verificar prefixo de código**

```sql
select material_code from buscar_materiais('10318', null, 5);
```

Esperado: só códigos que começam com `10318`.

- [ ] **Step 4: Verificar tolerância a erro de digitação**

```sql
select material_code, description from buscar_materiais('rolamneto', null, 5);
```

Esperado: devolve itens com `ROLAMENTO`. Se vier vazio, o limiar de similaridade está alto — ajuste com `set pg_trgm.similarity_threshold = 0.3` e reavalie.

- [ ] **Step 5: Medir contra a meta de p95**

```sql
explain analyze select * from buscar_materiais('luva 1/2 npt', 'MANU', 20);
explain analyze select * from buscar_materiais('parafuso sextavado m12', 'MANU', 20);
explain analyze select * from buscar_materiais('valvula esfera inox', null, 20);
```

Esperado: `Execution Time` **abaixo de 150 ms** nos três (meta original — revisada para ~217ms de p95, ver Global Constraints acima).

- [ ] **Step 5b: Confirmar que o índice GIN é realmente usado**

Descoberta da Tarefa 2, e o maior risco desta tarefa: quando a consulta traz
`order by material_code`, o planejador prefere caminhar o btree de
`material_code` já ordenado e filtrar linha a linha — **sem nunca tocar no
índice GIN**. Medido: a mesma consulta que roda em 6 ms sem ordenação leva
21 ms com `order by material_code limit 8`, e em nenhum dos dois casos o plano
mostra o GIN.

A RPC ordena por estoque, área, frequência e similaridade, então não deveria
cair nessa armadilha. Mas isso precisa ser visto, não presumido:

```sql
explain (analyze, verbose) select * from buscar_materiais('valvula esfera inox', null, 20);
```

Esperado no plano: **`Bitmap Index Scan on materials_busca_trgm`**.

Se aparecer `Seq Scan on materials` ou `Index Scan using materials_material_code_key`,
**pare e reporte**: o prefiltro pelo token mais longo não está sendo aproveitado
pelo índice, e nenhum ajuste de ordenação resolve isso sozinho. Sem uso do GIN,
esta tarefa não entrega o ganho, por mais que o tempo absoluto pareça aceitável
num banco com cache quente.

- [ ] **Step 6: Conferir os avisos do Supabase**

Rode o advisor de segurança (MCP `get_advisors`, tipo `security`). Esperado: nenhum aviso novo sobre `search_path` mutável ou `security definer` — a função foi criada com ambos tratados.

- [ ] **Step 7: Commit**

```bash
git commit --allow-empty -m "feat(db): rpc buscar_materiais com tokens, prefixo de codigo e sinais

Tempos medidos: luva 1/2 npt <X> ms, parafuso sextavado m12 <Y> ms,
valvula esfera inox <Z> ms. Meta p95 < 150 ms (revisado para ~217ms — ver Global Constraints)."
```

Substitua `<X>`, `<Y>` e `<Z>` pelos tempos do passo 5.

---

### Task 6: Cliente da busca

Fecha `lib/materiais.ts` com a chamada da RPC e os tipos do resultado, para que nenhuma view precise conhecer o formato do retorno.

**Files:**
- Modify: `src/lib/materiais.ts`
- Modify: `src/lib/materiais.test.ts`
- Modify: `src/types.ts`

**Interfaces:**
- Consumes: `normalizarTermo` (Task 1), RPC `buscar_materiais` (Task 5).
- Produces:
  ```ts
  export interface MaterialResultado { /* ver Step 2 */ }
  export async function buscarMateriais(
    termo: string,
    opts?: { areaUsuario?: string | null; limite?: number; signal?: AbortSignal },
  ): Promise<MaterialResultado[]>;
  export function resumoSinais(r: MaterialResultado): SinalChip[];
  export interface SinalChip { texto: string; tom: 'estoque' | 'demanda' | 'pedido' | 'uso' }
  ```

- [ ] **Step 1: Escrever o teste que falha**

`resumoSinais` é lógica pura: transforma o resultado da RPC nos chips que a UI mostra. É o que garante que "0x" nunca apareça.

Primeiro, amplie o import que já existe no topo de `src/lib/materiais.test.ts`:

```ts
import { normalizarTermo, resumoSinais, type MaterialResultado } from './materiais';
```

Depois acrescente ao fim do arquivo:

```ts
const base: MaterialResultado = {
  materialCode: '1031825',
  description: 'LUVA FM FM197 1/2" NPT 300#',
  technicalText: 'GALVANIZADO FOGO',
  unit: 'UN',
  qtdEstoque: null,
  depositos: null,
  rms12m: null,
  ultimaRm: null,
  rmsSemPedido: null,
  rmAberta: null,
  pedidoAberto: null,
  chegaEm: null,
  pedidoPelaArea: false,
};

describe('resumoSinais', () => {
  it('não inventa sinal quando não há dado', () => {
    expect(resumoSinais(base)).toEqual([]);
  });

  it('mostra saldo com o depósito', () => {
    const chips = resumoSinais({ ...base, qtdEstoque: 45, depositos: ['CD01'] });
    expect(chips).toEqual([{ texto: '45 UN em CD01', tom: 'estoque' }]);
  });

  it('mostra RM aberta sem pedido — alguém já pediu e não virou compra', () => {
    const chips = resumoSinais({ ...base, rmsSemPedido: 1, rmAberta: '0012345' });
    expect(chips).toContainEqual({ texto: 'RM 0012345 aberta, sem pedido', tom: 'demanda' });
  });

  it('mostra pedido a caminho com a data de remessa', () => {
    const chips = resumoSinais({ ...base, pedidoAberto: '4500123', chegaEm: '2026-08-12' });
    expect(chips).toContainEqual({ texto: 'Pedido 4500123 · chega 12/08/2026', tom: 'pedido' });
  });

  it('mostra frequência de uso', () => {
    const chips = resumoSinais({ ...base, rms12m: 12 });
    expect(chips).toContainEqual({ texto: '12 RMs em 12 meses', tom: 'uso' });
  });

  it('nunca mostra "0x" — ausência de dado não é informação', () => {
    const chips = resumoSinais({ ...base, rms12m: 0, qtdEstoque: 0, pedidoPelaArea: false });
    expect(chips).toEqual([]);
  });

  it('acrescenta o recorte da área só quando a área pediu de fato', () => {
    const chips = resumoSinais({ ...base, rms12m: 12, pedidoPelaArea: true });
    expect(chips).toContainEqual({ texto: 'sua área já pediu', tom: 'uso' });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npm test
```

Esperado: FALHA com `resumoSinais is not a function` (ou erro de importação de `MaterialResultado`).

- [ ] **Step 3: Implementar**

Primeiro, os imports — no **topo** de `src/lib/materiais.ts`, logo abaixo do comentário de cabeçalho:

```ts
import { supabase } from '../db/supabaseClient';
import { formatDateBR, formatQtd } from './format';
```

Depois, acrescente ao fim do arquivo:

```ts
/** Uma linha do retorno de `buscar_materiais`, já em camelCase. */
export interface MaterialResultado {
  materialCode: string;
  description: string;
  technicalText: string | null;
  unit: string;
  qtdEstoque: number | null;
  depositos: string[] | null;
  rms12m: number | null;
  ultimaRm: string | null;
  rmsSemPedido: number | null;
  rmAberta: string | null;
  pedidoAberto: string | null;
  chegaEm: string | null;
  pedidoPelaArea: boolean;
}

export interface SinalChip {
  texto: string;
  tom: 'estoque' | 'demanda' | 'pedido' | 'uso';
}

/**
 * Sinais que valem chip no resultado.
 *
 * A regra que atravessa tudo aqui: só entra o que existe. Um "0 em estoque"
 * ou "0 RMs" seria lido como informação ("conferi, não tem"), quando na
 * verdade é ausência de dado — 31% das RMs do SAP nem têm área preenchida.
 */
export function resumoSinais(r: MaterialResultado): SinalChip[] {
  const chips: SinalChip[] = [];

  if (r.qtdEstoque && r.qtdEstoque > 0) {
    const onde = r.depositos?.length ? ` em ${r.depositos.join(', ')}` : '';
    chips.push({ texto: `${formatQtd(r.qtdEstoque)} ${r.unit}${onde}`, tom: 'estoque' });
  }

  if (r.rmsSemPedido && r.rmsSemPedido > 0 && r.rmAberta) {
    chips.push({ texto: `RM ${r.rmAberta} aberta, sem pedido`, tom: 'demanda' });
  }

  if (r.pedidoAberto) {
    const quando = r.chegaEm ? ` · chega ${formatDateBR(r.chegaEm)}` : '';
    chips.push({ texto: `Pedido ${r.pedidoAberto}${quando}`, tom: 'pedido' });
  }

  if (r.rms12m && r.rms12m > 0) {
    chips.push({ texto: `${r.rms12m} RMs em 12 meses`, tom: 'uso' });
    if (r.pedidoPelaArea) chips.push({ texto: 'sua área já pediu', tom: 'uso' });
  }

  return chips;
}

/**
 * Consulta a RPC. Devolve lista vazia sem ir ao servidor quando o termo é
 * curto demais para valer a consulta — ver `normalizarTermo`.
 */
export async function buscarMateriais(
  termo: string,
  opts: { areaUsuario?: string | null; limite?: number } = {},
): Promise<MaterialResultado[]> {
  if (normalizarTermo(termo).tipo === 'curto') return [];

  const { data, error } = await supabase.rpc('buscar_materiais', {
    termo,
    area_usuario: opts.areaUsuario ?? null,
    limite: opts.limite ?? 20,
  });

  if (error) throw error;

  return (data ?? []).map((l: Record<string, unknown>) => ({
    materialCode: l.material_code as string,
    description: l.description as string,
    technicalText: (l.technical_text as string) ?? null,
    unit: (l.unit as string) ?? 'UN',
    qtdEstoque: (l.qtd_estoque as number) ?? null,
    depositos: (l.depositos as string[]) ?? null,
    rms12m: (l.rms_12m as number) ?? null,
    ultimaRm: (l.ultima_rm as string) ?? null,
    rmsSemPedido: (l.rms_sem_pedido as number) ?? null,
    rmAberta: (l.rm_aberta as string) ?? null,
    pedidoAberto: (l.pedido_aberto as string) ?? null,
    chegaEm: (l.chega_em as string) ?? null,
    pedidoPelaArea: Boolean(l.pedido_pela_area),
  }));
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```bash
npm test
```

Esperado: PASSA, 14 testes.

- [ ] **Step 5: Confirmar o lint**

```bash
npm run lint
```

Esperado: sem saída, código de saída 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/materiais.ts src/lib/materiais.test.ts src/types.ts
git commit -m "feat: cliente de busca de material com sinais de estoque e demanda"
```

---

### Task 7: Adotar a nova busca no formulário

Troca a consulta de `NewRequest.tsx` pela RPC e mostra os sinais no dropdown. É onde o ganho chega ao usuário — sem esperar o localizador em tela cheia, que é do plano 3.

**Files:**
- Modify: `src/views/NewRequest.tsx:121-179` (estados e efeito de busca), `:781-861` (dropdown)

**Interfaces:**
- Consumes: `buscarMateriais`, `resumoSinais`, `MaterialResultado`, `SinalChip` (Task 6); `Sector.sap_area_code` (Task 4).
- Produces: nada consumido adiante.

- [ ] **Step 1: Substituir o estado dos resultados**

Em `src/views/NewRequest.tsx`, troque o tipo do estado de resultados (linha 124) e acrescente o de erro:

```tsx
  const [activeSearchResults, setActiveSearchResults] = useState<MaterialResultado[]>([]);
  const [erroBusca, setErroBusca] = useState(false);
```

Ajuste o import de `Material` para trazer o que passa a ser usado:

```tsx
import { buscarMateriais, resumoSinais, type MaterialResultado } from '../lib/materiais';
```

- [ ] **Step 2: Substituir o efeito de busca**

Troque o corpo do `setTimeout` do efeito que hoje monta a query (linhas 155-174) por:

```tsx
    searchDebounceRef.current = setTimeout(async () => {
      const thisRequestId = ++searchRequestIdRef.current;
      setIsSearchingCatalog(true);
      setErroBusca(false);
      try {
        // Código tem precedência: quem digitou o código sabe o que quer.
        const termo = activeSapCodeTerm || activeDescriptionTerm;
        const setor = sectors.find(s => s.id === sectorId);
        const achados = await buscarMateriais(termo, {
          areaUsuario: setor?.sap_area_code ?? null,
          limite: 20,
        });
        if (searchRequestIdRef.current === thisRequestId) setActiveSearchResults(achados);
      } catch (err) {
        console.error('Erro ao buscar materiais no catálogo SAP:', err);
        if (searchRequestIdRef.current === thisRequestId) {
          setActiveSearchResults([]);
          // Sem isto, falha de rede e "não achei nada" ficam
          // indistinguíveis — os dois mostravam a mesma lista vazia.
          setErroBusca(true);
        }
      } finally {
        if (searchRequestIdRef.current === thisRequestId) setIsSearchingCatalog(false);
      }
    }, 300);
```

Acrescente `sectorId` e `sectors` às dependências do efeito.

- [ ] **Step 3: Mostrar o estado de erro no dropdown**

No dropdown, antes do ramo `activeSearchResults.length === 0`, acrescente:

```tsx
                            {erroBusca ? (
                              <div className="p-3 text-xs text-center" style={{ color: 'var(--status-serious)' }}>
                                Não foi possível buscar no catálogo.
                                <button
                                  type="button"
                                  onClick={() => setActiveSearchIndex(index)}
                                  className="block mx-auto mt-1 font-bold underline cursor-pointer"
                                  style={{ color: 'var(--brand)' }}
                                >
                                  Tentar de novo
                                </button>
                              </div>
                            ) : isSearchingCatalog ? (
```

E remova o `isSearchingCatalog ? (` que abria a cadeia, para não duplicar a condição.

- [ ] **Step 4: Mostrar os chips de sinal em cada resultado**

Dentro do `<button>` de cada resultado, logo abaixo da `div` que mostra `mat.technical_text`, acrescente:

```tsx
                                    {resumoSinais(mat).length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {resumoSinais(mat).map(chip => (
                                          <span
                                            key={chip.texto}
                                            className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                            style={{
                                              background: chip.tom === 'estoque'
                                                ? 'color-mix(in srgb, var(--status-good) 14%, transparent)'
                                                : chip.tom === 'demanda'
                                                ? 'color-mix(in srgb, var(--status-warning) 18%, transparent)'
                                                : chip.tom === 'pedido'
                                                ? 'var(--brand-wash)'
                                                : 'var(--surface-sunken)',
                                              color: chip.tom === 'pedido' ? 'var(--brand-strong)' : 'var(--ink-secondary)',
                                            }}
                                          >
                                            {chip.texto}
                                          </span>
                                        ))}
                                      </div>
                                    )}
```

- [ ] **Step 5: Ajustar os campos que o resultado preenche**

O clique no resultado usava `mat.material_code`, `mat.description` e `mat.unit`. Os nomes mudaram para camelCase:

```tsx
                                    updated[index] = {
                                      ...updated[index],
                                      description: mat.description,
                                      sap_code: mat.materialCode,
                                      unit: mat.unit || 'UN'
                                    };
```

E na exibição, `mat.material_code` vira `mat.materialCode`, `mat.technical_text` vira `mat.technicalText`, e a `key` passa a ser `mat.materialCode` — a RPC não devolve `id`.

- [ ] **Step 6: Substituir o autopreenchimento por código**

`handleItemChange` hoje consulta `materials` diretamente quando o campo tem 8 dígitos (linhas 379-389). Troque por `buscarMateriais`, que já aceita prefixo a partir de 4 dígitos:

```tsx
    if (key === 'sap_code' && String(val).trim().length >= 4) {
      const code = String(val).trim();
      buscarMateriais(code, { limite: 1 })
        .then(([achado]) => {
          if (!achado || achado.materialCode !== code) return;
          setItems(prev => prev.map((item, i) => {
            if (i !== index || item.sap_code.trim() !== code) return item; // usuário já mudou o campo
            return { ...item, description: achado.description, unit: achado.unit || 'UN' };
          }));
        })
        .catch(err => console.error('Falha ao autopreencher pelo código SAP:', err));
    }
```

- [ ] **Step 7: Confirmar que o lint passa**

```bash
npm run lint
```

Esperado: sem saída. Se acusar `Material` importado e não usado, remova-o do import de `../types`.

- [ ] **Step 8: Testar no navegador**

```bash
npm run dev
```

Abra `http://localhost:3000`, vá em Nova Solicitação → Compra e verifique, com o painel de rede aberto:

1. Digitar `luva npt galvanizado` devolve resultados e **não** traz o `1031826` (sem revestimento).
2. A resposta chega em menos de 300 ms — antes eram 1,4 s por tecla.
3. Um item com saldo mostra o chip verde de estoque.
4. Digitar `1031` no campo de código já filtra (antes exigia os 8 dígitos).
5. Digitar uma letra só não dispara requisição alguma.

- [ ] **Step 9: Commit**

```bash
git add src/views/NewRequest.tsx
git commit -m "feat: nova solicitacao usa a busca indexada com sinais de estoque e demanda"
```

---

### Task 8: Refresh dos sinais na importação

Sem isso a materialized view congela no dia em que foi criada, e os sinais viram mentira em vez de ajuda.

**Files:**
- Modify: `src/db/localDb.ts` — três importadores, cada um logo antes do seu `supabase.from('import_logs').insert(logObj)`:

| Método | Linha do método | Insert em `import_logs` | Alimenta |
|---|---|---|---|
| `importME5ARaw` | 3531 | 3778 | `requisicoes` → `vw_demandas` |
| `importZL0132Raw` | 3812 | 4126 | `pedidos` |
| `importZL0024Raw` | 4813 | 4925 | `estoque` |

Os outros três importadores (`importPedidosForn`, `importContatos`, `importCidadeForn`) **não** alimentam `mv_material_sinais` e ficam de fora.

**Interfaces:**
- Consumes: `refresh_material_sinais()` (Task 3).
- Produces: nada.

- [ ] **Step 1: Extrair o helper do refresh**

Um método privado, para não repetir o mesmo bloco três vezes. Acrescente em `localDb.ts`, junto dos demais privados:

```ts
  /**
   * Atualiza os sinais que a busca de material mostra — saldo, RM aberta,
   * pedido a caminho. Eles vivem numa materialized view; sem este refresh ela
   * congela na data de criação, e saldo velho é pior que saldo nenhum, porque
   * parece conferido.
   *
   * Falha aqui não desfaz a importação: os dados já entraram, e a próxima
   * carga corrige o sinal.
   */
  private async refreshMaterialSinais(): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.rpc('refresh_material_sinais');
    if (error) console.warn('Falha ao atualizar os sinais de material:', error);
  }
```

- [ ] **Step 2: Chamar nos três importadores**

Em `importME5ARaw`, `importZL0132Raw` e `importZL0024Raw`, imediatamente **antes** da linha `await supabase.from('import_logs').insert(logObj);` (linhas 3778, 4126 e 4925 antes desta edição — confirme o contexto, os números deslocam conforme você edita):

```ts
      await this.refreshMaterialSinais();
```

- [ ] **Step 3: Confirmar o lint**

```bash
npm run lint
```

Esperado: sem saída, código de saída 0.

- [ ] **Step 4: Verificar que o refresh roda de fato**

Rode uma importação pela interface e confira em seguida:

```sql
select count(*) from mv_material_sinais where qtd_estoque is not null;
```

Esperado: número coerente com o estoque recém-importado.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat: atualiza os sinais de material ao fim de cada importacao"
```

---

## Verificação final

- [ ] `npm test` — 14 testes passando.
- [ ] `npm run lint` — limpo.
- [ ] `explain analyze` da RPC nos três termos do diagnóstico, todos abaixo de 150 ms (meta original — revisada para ~217ms, ver Global Constraints), com os números anotados nos commits.
- [ ] `buscar_materiais('luva npt galvanizado')` distingue `1031825` de `1031826` — o caso que a busca antiga não resolvia.
- [ ] Advisor de segurança do Supabase sem aviso novo.
- [ ] No navegador: busca responde abaixo de 300 ms, chips de sinal aparecem, código com 4 dígitos já filtra.

## Fora deste plano

- Localizador em tela cheia e fluxo de compra em duas etapas — **plano 3**, que consome `buscarMateriais` desta entrega.
- Unificação de `MyRequests`, `Solicitacoes` e `Approvals` — **plano 2**.
- Bloqueio de compra sem código SAP e `sinais_no_envio` — **plano 3**.
- Confirmar o significado de `ADMI`, `SEGE` e `SEGT` em `area_solicitante` — pergunta pendente para Suprimentos, registrada no spec.
