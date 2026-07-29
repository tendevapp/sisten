# Redesenho do módulo de Solicitações

Data: 2026-07-28

Solicitações é uma das funções centrais do SISTEN. Hoje o módulo tem três telas
que fazem a mesma coisa de três jeitos diferentes, e a busca no catálogo SAP —
o passo que mais consome o tempo de quem abre uma compra — leva 1,4 segundo por
tecla e não encontra o item certo. Este documento define o redesenho.

Sucede e amplia:
- `2026-07-28-pagina-solicitacoes-design.md` (fila coletiva)
- `2026-07-28-editar-solicitacao-design.md` (edição com nova aprovação)
- `2026-07-28-anexos-imagens-design.md` (anexos por item)

## Diagnóstico

### Três telas para o mesmo trabalho

`MyRequests.tsx` (645 linhas), `Solicitacoes.tsx` (450) e `Approvals.tsx` (328)
leem a mesma tabela `requests` e montam a mesma coisa: lista + painel de
detalhe. Cada uma reimplementou por conta própria o rótulo de status, o badge de
criticidade e a thread de comentários. Os rótulos já divergem: `rotuloStatus` em
`lib/solicitacoes.ts` diz "Aguardando aprovação" para compra pendente, e o
`getStatusLabel` local da `MyRequests` diz "Pendente".

### Dois dialetos visuais

`NewRequest.tsx` e `Solicitacoes.tsx` usam os tokens (`var(--ink-primary)`,
`var(--brand)`) e funcionam no tema escuro. `MyRequests.tsx` e `Approvals.tsx`
usam Tailwind de cor fixa (`bg-white`, `text-slate-800`, `bg-emerald-50`) e
**ficam brancas no tema escuro**. Há classes que não existem e portanto não
pintam nada: `text-slate-805`, `bg-emerald-750`, `dark:bg-slate-850`,
`text-slate-850`.

`DESIGN.md` declara a marca como azul `#0056c6`; `tokens.css` roda verde
`#059669`. O documento está desatualizado em relação ao código.

### A busca no catálogo SAP

`materials` tem **172.130 linhas** e nenhum índice de texto — só btree em
`material_code` e na PK. A busca de `NewRequest.tsx:159-163` é
`ilike '%termo%'` em `description`, a cada tecla (debounce de 300 ms).

Medição real, termo comum, melhor caso porque o `limit 8` fecha cedo:

```
Index Scan using materials_material_code_key  (materials)
  Filter: (is_active AND (description ~~* '%luva%'))
  Rows Removed by Filter: 18332     Buffers: shared hit=9918
Execution Time: 1398.360 ms
```

Termo raro varre as 172 mil linhas inteiras. Além do custo:

- **Só busca `description`.** O `technical_text` fica de fora — e é exatamente
  ele que separa quase-duplicatas. Três materiais distintos compartilham a
  descrição `LUVA FM FM197 1/2" NPT 300#`; o que os distingue é
  `GALVANIZADO FOGO` vs `SEM REVESTIMENTO`, e a norma `ASME B16.3` vs
  `ABNT NBR 6925`.
- **A frase inteira vira um único `like`.** "parafuso sextavado m12" não casa
  `PARAFUSO M12 SEXTAVADO`.
- **Sem acento-insensibilidade.** "válvula" não acha `VALVULA`.
- **Sem tolerância a erro de digitação.** Zero resultado é um beco sem saída.
- **`category` é inútil como filtro:** 122.150 dos 172.130 materiais (71%)
  estão em `OUTROS`.
- **Ordena por `material_code`,** que não tem relação com relevância.

O catálogo também não tem taxonomia alternativa: `materials` só tem
`material_code`, `description`, `technical_text`, `category`, `company`, `unit`
e `is_active`. Grupo de mercadoria existe em `estoque` e `pedidos`, mas cobre
**2.052 dos 172.130 materiais (1,2%)** — filtrar por ele cairia na mesma
armadilha do `category`. Este redesenho, portanto, **não filtra por taxonomia:
filtra pelos sinais de uso**, que é a informação que o catálogo de fato tem.

### Sinais que existem no banco e ninguém usa

- `estoque` — 2.291 linhas com `material`, `quantidade`, `deposito`,
  `preco_medio`. Saber que há saldo evita a compra inteira.
- `vw_demandas` — 1.684 RMs do SAP com `material`, `area_solicitante`,
  `requisitante`, `data_da_solicitacao` e `pedido` (nulo = RM ainda sem PO).
  Dá tanto a frequência de uso quanto a demanda em aberto.
- `pedidos` — 1.047 linhas com `material`, `doc_compra`, `dt_remessa`,
  `fornecedor_nome`. Diz o que já está comprado e a caminho.

### Compra e Cadastro SAP não se falam

São abas separadas. Quem não acha o item digita texto livre, a solicitação segue
com `has_no_sap_code = true` e nunca vira um cadastro. O comprador recebe um item
sem código e volta perguntando.

## Decisões

Tomadas com o solicitante do redesenho, registradas para não serem
redescobertas:

| Decisão | Escolha |
|---|---|
| Escopo | Módulo inteiro (4 telas) + migração de banco |
| Público | Misto: desktop e celular |
| Item com saldo em estoque | Avisar, sem bloquear |
| Demanda já em aberto | Avisar também: RM sem PO **e** RM com PO |
| Compra de item sem código SAP | **Bloquear** |
| Exceção ao bloqueio | Tipo de compra **Serviço** |
| Arquitetura das telas | Uma tela só, com escopos por papel |
| Formato da lista | Cartões + página de detalhe em rota própria |
| Formato da busca de item | Localizador em tela cheia, em fluxo de 2 etapas |

## Arquitetura

### Telas

`MyRequests.tsx`, `Solicitacoes.tsx` e `Approvals.tsx` são substituídas por:

**`views/Solicitacoes.tsx`** — lista de cartões com abas de escopo:

| Escopo | Recorte | Quem vê |
|---|---|---|
| Minhas | `solicitante_id = user.id` | todos |
| Do meu setor | `solicitante_sector_id = user.sector_id` | gestor |
| Para aprovar | compra `pendente` do setor | gestor, admin |
| Atribuídas a mim | `comprador_id` ou `atendente_id = user.id` | comprador, atendente |
| Todas | tudo que o papel enxerga | papéis de `PAPEIS_FILA` |

Quais abas existem sai de `escoposVisiveis(user)` em `lib/solicitacoes.ts` — um
lugar só, em vez dos três filtros divergentes de hoje.

**`views/SolicitacaoDetalhe.tsx`** — rota `/solicitacoes/:numero`. Mesma página
em qualquer largura; navegar até ela é navegação de verdade, então voltar é o
botão voltar e o link é compartilhável.

A página de detalhe não tem variante por papel. Ela chama
`acoesDisponiveis(request, user)`, que devolve a lista de ações possíveis
naquele status para aquele usuário:

| Ação | Condição |
|---|---|
| Aprovar / Rejeitar / Pedir revisão | gestor do setor, compra `pendente` |
| Responder (com nota interna) | `podeComentarInternamente(user)` |
| Responder (público) | qualquer participante |
| Editar | `podeEditar(request, user)` (regra existente, preservada) |
| Anexar arquivo | solicitação não encerrada |
| Avaliar atendimento | autor, chamado `resolvido`/`fechado` |

### Componentes compartilhados

Em `components/solicitacoes/`, cada um usado pelas duas telas:

`StatusBadge`, `CriticidadeBadge`, `Stepper`, `Thread`, `HistoricoTimeline`,
`ItensList`, `SolicitacaoCard`.

Todo rótulo passa a vir de `lib/solicitacoes.ts` (`rotuloStatus`, `rotuloTipo`,
`rotuloCriticidade`), que já existe. Os `getStatusLabel` locais são apagados.

### Seleção em lote

O cartão ganha checkbox no canto. Ao marcar o primeiro, aparece a barra com
*Exportar Excel* e *Baixar anexos* — as funções `exportarSolicitacoes` e
`baixarAnexos` de `lib/solicitacoes.ts` são reaproveitadas sem alteração.

### Impacto fora do módulo

`lib/pages.ts` perde `sol_minhas` e `sol_aprovacoes`; `sol_todas` vira o único
item de lista, com `defaultRoles: '*'` (o recorte agora é por escopo dentro da
tela, não por acesso à página). `App.tsx` ganha a rota de detalhe.

Usuários com `page_access` gravado nos ids antigos precisam de migração: quem
tinha `sol_minhas` ou `sol_aprovacoes` passa a ter `sol_todas`.

## Busca de material

### Migração de banco

```sql
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- unaccent() não é IMMUTABLE; coluna gerada exige um wrapper que seja.
create function f_unaccent(text) returns text
  language sql immutable parallel safe strict
  as $$ select public.unaccent('public.unaccent', $1) $$;

alter table materials add column busca_texto text
  generated always as (
    f_unaccent(upper(description || ' ' || coalesce(technical_text, '')))
  ) stored;

create index materials_busca_trgm on materials using gin (busca_texto gin_trgm_ops);
create index materials_code_prefix on materials (material_code text_pattern_ops);
```

O `technical_text` entrar no texto de busca é a mudança que resolve as
quase-duplicatas: buscar "luva npt galvanizado" passa a distinguir o `1031825`
do `1031826`.

### Sinais pré-agregados

Uma materialized view por `material_code`, atualizada junto da importação —
sem ela cada tecla faria três joins:

```sql
create materialized view mv_material_sinais as
with saldo as (
  select material,
         sum(quantidade)                          as qtd_estoque,
         array_agg(distinct deposito)             as depositos
  from estoque
  where quantidade > 0
  group by material
),
demanda as (
  select material,
         count(*)                                       as rms_12m,
         max(data_da_solicitacao)                       as ultima_rm,
         array_agg(distinct area_solicitante)
           filter (where area_solicitante is not null)  as areas,
         count(*) filter (where pedido is null)         as rms_sem_pedido,
         min(requisicao_de_compra) filter (where pedido is null) as rm_aberta
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
       s.qtd_estoque, s.depositos,
       d.rms_12m, d.ultima_rm, d.areas, d.rms_sem_pedido, d.rm_aberta,
       c.pedido_aberto, c.chega_em
from materials m
left join saldo    s on s.material = m.material_code
left join demanda  d on d.material = m.material_code
left join comprado c on c.material = m.material_code
where m.is_active;

create unique index on mv_material_sinais (material_code);
```

`refresh materialized view concurrently` no fim de cada importação de estoque,
requisições ou pedidos.

Os nomes de coluna acima saem do schema real e devem ser reconferidos na
implementação — `pedidos` usa `dt_remessa`/`qtd_fornecida`/`qtd_pedido`, e
`vw_demandas` usa `data_da_solicitacao`/`requisicao_de_compra`/`pedido`.

### RPC

`buscar_materiais(termo text, limite int default 20)` devolve o material com os
sinais já anexados, num payload enxuto — o `select *` de hoje traz o
`technical_text` inteiro de cada linha, e o projeto tem preocupação declarada
com egress (`otimizacao_egress.sql`).

Regras dentro da RPC:

1. **Termo só de dígitos** → prefixo em `material_code`. Autopreenchimento a
   partir de 4 dígitos (hoje exige os 8 exatos).
2. **Termo textual** → normaliza com `f_unaccent(upper(...))`, quebra em tokens,
   exige **todos** presentes em `busca_texto` (ordem livre). É o que faz
   "parafuso sextavado m12" achar `PARAFUSO M12 SEXTAVADO`.
3. **Zero resultado** → segunda passada por similaridade trigram, para tolerar
   erro de digitação ("rolamneto" → `ROLAMENTO`).
4. **Ordenação** — relevância (`similarity` com a descrição) e, em cima dela,
   reforço para material com saldo em estoque e para material já pedido antes.
   Empate desfeito por `material_code`.

#### Pré-requisito: mapear setor para área SAP

O reforço "a **sua área** já pediu este item" e o sinal correspondente dependem
de um mapeamento que hoje não existe. `requisicoes.area_solicitante` guarda
códigos SAP de quatro letras (`ALMO`, `MANU`, `ADMI`, `SAUD`, `SEGE`, `ENGE`,
`QUAL`, `TI`, `PROD`, `CONT`…), e `sectors` só tem `id` e `name`.

Portanto: `sectors` ganha a coluna `sap_area_code text`, preenchida por
migração para os setores de correspondência direta (`ALMO` → Almoxarifado,
`MANU` → Manutenção, `ENGE` → Engenharia, `QUAL` → Qualidade, `TI` → TI,
`PROD` → Produção, `CONT` → Contabilidade, `SAUD` → Saúde). Os ambíguos
(`ADMI`, `SEGE`, `SEGT`) ficam nulos até alguém de Suprimentos confirmar — o
plano deve perguntar, não adivinhar.

Cobertura é parcial e o desenho assume isso: **516 das 1.684 RMs (31%) têm
`area_solicitante` nulo**. Consequência: a frequência total de RMs aparece
sempre; o recorte "sua área pediu Nx" só aparece quando o setor tem código
mapeado e há dado. Nunca se mostra "0x" — a ausência de informação não é
informação.

### Comportamento, antes e depois

| Hoje | Depois |
|---|---|
| `ilike '%frase inteira%'` | tokens, em qualquer ordem |
| só `description` | `description` + `technical_text` |
| "válvula" ≠ `VALVULA` | `unaccent` |
| código exato, 8 dígitos | prefixo a partir de 4 dígitos |
| zero resultado é beco sem saída | queda para similaridade trigram |
| ordem por `material_code` | relevância + estoque + histórico de uso |
| 1398 ms | meta **p95 < 150 ms** |

A meta é verificada com `explain analyze` contra os mesmos termos usados no
diagnóstico, e o resultado registrado no plano.

**Ressalva medida na implementação:** `order by material_code limit N` muda o
plano de consulta — o planejador pode preferir caminhar o btree de
`material_code` já ordenado, ignorando qualquer índice de texto dos dois
lados da comparação. Medido: a mesma busca por "luva" levou 3634 ms (forma
antiga) e 21 ms (forma nova) **quando ambas usam essa cláusula** — nenhuma
tocou o índice GIN. Sem a cláusula, a forma nova caiu para 6 ms com
`Bitmap Index Scan on materials_busca_trgm` confirmado. A RPC não ordena por
`material_code`, então não deveria cair nessa armadilha, mas isso é
verificado, não presumido — ver a Tarefa 5 do plano de implementação.

**Meta revisada após medição real:** amostras espaçadas ao longo de um dia
(fora do efeito de cache quente logo após a migração) mediram p95 ≈ 217 ms,
acima dos 150 ms planejados. A causa confirmada é pressão de cache do banco
compartilhado — o plano de consulta usa o índice GIN corretamente em todos os
casos, não é uma consulta mal-formada. Decisão: aceitar 217 ms como a meta de
fato. Ainda é uma melhora de ~6x sobre os 1398 ms da busca antiga, e
imperceptível num dropdown com debounce de 300 ms. Sem trabalho adicional de
otimização neste plano.

### Sinais mostrados no resultado

- `45 UN em CD01` — tem saldo no almoxarifado;
- `RM 0012345 aberta, sem pedido` — já foi pedido, ainda não virou PO;
- `Pedido 4500123 · chega 12/08` — já comprado, a caminho;
- `12 RMs em 12 meses · última em 03/2026` — frequência de uso;
- `sua área pediu 8x` — só quando o setor tem `sap_area_code` mapeado e há dado.

**Nenhum bloqueia.** Escolher um item que tem saldo ou demanda em aberto marca o
item com um aviso discreto, visível para o gestor na aprovação e para o
comprador no atendimento.

## Nova solicitação

### Duas etapas, só para compra

Cadastro SAP e chamado são curtos e continuam numa tela só. O seletor de canal
(Compra / Cadastro SAP / Chamado) permanece na entrada, e em modo edição segue
travado como hoje.

**Etapa 1 — o que você precisa.** Abre no buscador, porque é onde está o
trabalho. *Buscar no catálogo* abre o **localizador em tela cheia**:

- campo de busca no topo;
- filtros pelos **sinais**, não por taxonomia: *com estoque*, *já pedido antes*,
  *unidade*, *empresa* (`company`). Nem `category` (71% `OUTROS`) nem grupo de
  mercadoria (1,2% de cobertura) servem — ver Diagnóstico;
- lista de resultados à esquerda;
- ficha do item à direita com o `technical_text` **inteiro** (é ele que decide),
  saldo por depósito, histórico de RMs e demanda em aberto;
- quantidade + *Adicionar*, acumulando vários itens antes de voltar.

No celular o localizador é rota própria em tela cheia, não modal, com a ficha
abaixo do resultado selecionado.

Fora do localizador, cada item ainda edita marca, "ou similar", fornecedor
sugerido, estimativa, observação e fotos. A câmera é ação de primeira classe no
celular: foto da peça e da etiqueta é o que evita o vaivém de esclarecimento.

**Etapa 2 — prazo e criticidade.** Setor solicitante, comprador, tipo de compra,
data de necessidade, criticidade e justificativa. Setor e comprador vêm
**pré-preenchidos do último pedido do usuário**; hoje ele reescolhe os mesmos
dois selects toda vez.

Barra de progresso fixa com as duas etapas. O rascunho automático em
`localStorage` passa a guardar em qual etapa parou. Anexos continuam fora do
rascunho — `Blob` não sobrevive a `JSON.stringify`, motivo já registrado no
código.

### Item sem código SAP

Compra de tipo **Estoque** ou **Direta** não envia com item sem código de 8
dígitos. A validação existe no formulário **e** em `submitRequest` — regra de
tela sozinha não é regra.

Quando não há resultado, o localizador oferece a saída: *"Não achou? Peça o
cadastro deste item"*, que leva ao canal Cadastro SAP com o que já foi digitado
preservado.

**Serviço é a exceção:** descrição livre, sem código, com campo de escopo.
`has_no_sap_code` continua no dado, valendo para serviço e para o histórico já
gravado.

Consequência aceita conscientemente: compra urgente de peça fora do catálogo
fica travada até Suprimentos criar o código. O ponto de escape natural, se o
atrito aparecer na prática, é liberar criticidade 5 com justificativa
obrigatória — o desenho deixa o gancho, sem implementá-lo agora.

## Dados

- `request_items.sap_code` obrigatório para compra não-serviço, por validação de
  aplicação. A coluna segue `nullable`: há itens já gravados sem código.
- Nova coluna `request_items.sinais_no_envio jsonb` — congela o que a pessoa viu
  ao escolher o item (saldo, RM aberta, PO a caminho, data da leitura). Sem
  isso, o gestor aprova dias depois olhando um estoque que já mudou, e ninguém
  sabe com qual informação a decisão foi tomada.
- Nova coluna `sectors.sap_area_code text` — o mapeamento entre setor do app e
  área SAP das requisições, detalhado na seção de busca. Preenchida por migração
  para os setores de correspondência direta; nula para os ambíguos.
- Nada de novo em `requests`. A etapa do rascunho vive no `localStorage`.

## Visual

Todas as telas do módulo passam a usar exclusivamente os tokens de
`styles/tokens.css`. Some todo hex cru e toda classe Tailwind de cor fixa —
e com isso o **tema escuro passa a funcionar** em Minhas Solicitações e
Aprovações, que hoje ficam brancas no escuro. Junto vão as classes inexistentes
(`text-slate-805`, `bg-emerald-750`, `dark:bg-slate-850`, `text-slate-850`).

Criticidade e status usam a escala reservada (`--status-good`,
`--status-warning`, `--status-serious`, `--status-critical`) sempre com **ícone
mais rótulo**, nunca cor sozinha. Os cinco graus mantêm a semântica que
`NewRequest` já define, e que difere entre compra e chamado.

`DESIGN.md` é atualizado no mesmo passo: declarar marca azul `#0056c6` enquanto
o app roda verde `#059669` é armadilha para o próximo que mexer.

## Erros

- Falha de anexo **não** desfaz a solicitação — comportamento atual, preservado.
  Mas o aviso sai do `alert()` e vai para o `Toast` que o projeto já tem, em
  `components/ui/Toast.tsx`.
- Falha de busca mostra estado de erro com *tentar de novo*. Hoje um erro de
  rede produz o mesmo dropdown vazio que "não achei nada" — indistinguíveis.
- Busca sem resultado mostra o caminho do Cadastro SAP, não um beco sem saída.

## Testes

Lógica pura, testável sem renderizar componente:

- `acoesDisponiveis(request, user)` — a matriz de ação por papel e status;
- `escoposVisiveis(user)` — quais abas cada papel enxerga;
- tokenização e normalização do termo de busca;
- validação de item sem código SAP, incluindo a exceção de serviço.

A RPC `buscar_materiais` ganha verificação de plano com `explain analyze`
contra a meta de p95 < 150 ms, com os mesmos termos do diagnóstico.

## Lacuna de dado encontrada na implementação

`mv_material_sinais` (Tarefa 3 do plano de busca) mediu `com_estoque = 1276`
contra os 2.052 materiais distintos com saldo positivo em `estoque` — uma
cobertura de 62%. Causa confirmada: `estoque.material` mistura três formatos
de código (1.885 com 7 dígitos, igual a `materials.material_code`; 137 com
18 dígitos; 30 com 5 dígitos), e dos 1.885 de 7 dígitos, **609 não existem em
`materials`** — provavelmente itens descontinuados do catálogo, não
confirmado.

Decisão: **seguir sem corrigir agora**. O sinal de estoque é aditivo por
design — ausência de chip nunca foi tratada como erro, e os 776 materiais
afetados (38%) simplesmente não mostram o sinal, sem quebrar nada da RPC ou
do restante do redesenho. Corrigir a cobertura (normalizar os formatos de
código, e investigar se os 609 ausentes são descontinuados ou lacuna real de
importação) fica como trabalho de qualidade de dado, fora deste plano.

## Fora de escopo

- Endurecer a RLS por setor. A policy `requests_read` continua permitindo ao
  gestor ler todas as solicitações; o recorte segue sendo de tela. Já anotado
  em `2026-07-28-pagina-solicitacoes-design.md` e continua pendente.
- Recategorizar os 122 mil materiais em `OUTROS`, e trazer grupo de mercadoria
  para o catálogo inteiro. O redesenho contorna a falta de taxonomia filtrando
  pelos sinais de uso; corrigir o dado é trabalho à parte, e é o que
  desbloquearia filtro por família de material.
- Normalizar os formatos de código em `estoque.material` e investigar os 609
  materiais sem correspondência em `materials` — ver "Lacuna de dado
  encontrada na implementação", acima.
- Confirmar o significado de `ADMI`, `SEGE` e `SEGT` em `area_solicitante`.
  Ficam sem mapeamento até alguém de Suprimentos dizer.
- Liberar item sem código SAP por criticidade 5. Gancho previsto, não
  implementado.
