# Cadastros SAP (status, tipo de documento, grupo de mercadoria, tipo de movimento)

## Contexto

As tabelas de importação SAP (`requisicoes`, `pedidos`, `pedidosforn`, `estoque`) guardam vários campos como código puro do SAP — `status_processamento`, `tipo_de_documento`/`tpdc`/`tipo_doc_compra`, `grupo_de_mercadorias`/`grp_mercad`/`grupo_mercadorias`/`grp_mercads` — sem nenhuma tabela de decodificação. Quem monta um relatório precisa saber de cor que `status_processamento = 'B'` quer dizer "Pedido criado" ou que `ZR01` é "Material Normal".

O usuário forneceu 6 listas de código do SAP (telas de customizing/relatório). Conferindo contra os dados reais no Postgres (`fwezzgduywgyhxinjurn`):

- **Status de requisição** e **"Status RC"** são o mesmo domínio (A/B/E/K/L/N/S) — hoje só A, B e N aparecem em `requisicoes.status_processamento`, mas o domínio inteiro colado bate certinho.
- **Tipos de requisição ZR01-ZR17** são um subconjunto da tabela **Ctg/Tipo/Denominação** (categoria B). Essa tabela maior cobre também a categoria F, que é o que `pedidos.tipo_doc_compra`/`pedidosforn.tipo_doc_compra` usa (`ZP01`, `ZP06`, `ZP07`, `ZP09`, `ZP15`, `ZP16` — todos presentes na lista colada).
- Existe colisão real de código entre categorias no SAP: `FO` e `NB` aparecem tanto na categoria B quanto na F, com denominações diferentes. Não usados nos dados atuais (que só têm códigos `ZR*`/`ZP*`), mas a estrutura da tabela precisa suportar isso.
- **Grupo de mercadoria**: os dados reais em `requisicoes.grupo_de_mercadorias`, `estoque.grp_mercad`, `estoque.grupo_mercadorias` e `pedidos.grp_mercads` usam um espaço de códigos com prefixos `B`, `E`, `M` e `S` (ex.: `B0101`, `E02005002`, `M08018002`, `S0001`). O texto colado pelo usuário cobriu **só o ramo B** (categoria "CONSUMÍVEL") antes de estourar o limite de caracteres da mensagem; o usuário optou por popular só o que veio, deixando os ramos E/M/S para uma carga futura.
- **Tipo de movimento** (101-992, ~200 códigos): nenhuma coluna do banco guarda esse código hoje. Entra como cadastro de referência isolado, sem FK — para uso quando houver importação de histórico de movimentação de estoque.

## Escopo

- 4 tabelas novas de cadastro no schema `public`, seguindo o padrão de `compradores` (RLS: leitura para `authenticated`, sem policy de escrita — população só via migration/SQL direto).
- FK real (enforçada) só onde o domínio cadastrado cobre 100% dos valores existentes: status de requisição.
- Sem FK enforçada em tipo de documento (a coluna de origem não guarda a categoria, e o mesmo código pode significar coisas diferentes por categoria) nem em grupo de mercadoria (dado incompleto). Essas decodificações acontecem só nas views, via `LEFT JOIN`, para nunca derrubar uma linha por falta de cadastro.
- 3 views decoradas para consumo direto em relatórios, sempre `LEFT JOIN` (nunca perdem linha da tabela de origem).
- **Fora de escopo:** UI de administração dos cadastros, importação do ramo E/M/S do grupo de mercadoria (fica para quando o usuário completar a lista), qualquer tela nova no app — esta tarefa é só banco de dados.

## Tabelas de cadastro

### `cadastro_status_requisicao`

```sql
create table public.cadastro_status_requisicao (
  codigo text primary key,
  descricao text not null,
  detalhe text
);
```

7 linhas: A, B, E, K, L, N, S (conforme lista "Status"/"Status RC" — consolidadas, é o mesmo domínio).

### `cadastro_tipo_documento`

```sql
create table public.cadastro_tipo_documento (
  categoria text not null,
  codigo text not null,
  denominacao text not null,
  primary key (categoria, codigo)
);
```

Chave composta porque o mesmo código (`FO`, `NB`) existe em mais de uma categoria com denominação diferente. ~90 linhas, categorias A/B/F/K/L, da tabela "Ctg/Tipo/Denominação".

### `cadastro_grupo_mercadoria`

```sql
create table public.cadastro_grupo_mercadoria (
  codigo text primary key,
  denominacao text not null,
  denominacao2 text,
  classificacao_nivel1 text,
  codigo_pai text references public.cadastro_grupo_mercadoria(codigo)
);
```

`codigo_pai` é derivado pelo prefixo (ex.: `B0101` → pai `B01`; grupos de 2 dígitos como `B01` não têm pai). Populada só com o ramo B (~140 linhas) nesta rodada; os ramos E/M/S ficam para quando o usuário completar a lista.

### `cadastro_tipo_movimento`

```sql
create table public.cadastro_tipo_movimento (
  codigo text primary key,
  descricao text not null
);
```

~200 linhas (101-992). Linhas com descrição em branco na planilha original (ex.: `871`, `933`, `Z21`) entram com `descricao = null`, não são descartadas — o código existe no SAP, só não tem rótulo.

### RLS (todas as 4 tabelas, igual a `compradores`)

```sql
alter table public.<tabela> enable row level security;
create policy <tabela>_read on public.<tabela> for select to authenticated using (true);
```

Sem policy de escrita: população é só via migration. Se um dia precisar de manutenção pela UI, isso é decisão separada.

## Views decoradas

Todas seguem o mesmo padrão: `select tabela.*, <colunas decoradas> from tabela left join cadastro...`. Nomes de coluna decorada usam sufixo `_desc` para não colidir com os campos crus já existentes na tabela de origem.

### `vw_requisicoes_decorada`

```sql
create or replace view public.vw_requisicoes_decorada as
select
  r.*,
  st.descricao as status_desc,
  st.detalhe as status_detalhe,
  td.denominacao as tipo_documento_desc,
  gm.denominacao as grupo_mercadoria_desc,
  gm.classificacao_nivel1 as grupo_mercadoria_classificacao
from public.requisicoes r
left join public.cadastro_status_requisicao st on st.codigo = r.status_processamento
left join public.cadastro_tipo_documento td
  on td.codigo = r.tipo_de_documento and td.categoria = 'B'
left join public.cadastro_grupo_mercadoria gm on gm.codigo = r.grupo_de_mercadorias;

grant select on public.vw_requisicoes_decorada to authenticated;
```

`tipo_de_documento` fixado em categoria `'B'` porque é o único domínio que essa coluna usa hoje (requisição de compra). Se um dia aparecer um código de outra categoria em `requisicoes`, o join simplesmente não encontra e `tipo_documento_desc` fica nulo — não quebra a view.

### `vw_estoque_decorado`

```sql
create or replace view public.vw_estoque_decorado as
select
  e.*,
  gm.denominacao as grupo_mercadoria_desc,
  gm.classificacao_nivel1 as grupo_mercadoria_classificacao
from public.estoque e
left join public.cadastro_grupo_mercadoria gm on gm.codigo = e.grupo_mercadorias;

grant select on public.vw_estoque_decorado to authenticated;
```

Decora só `grupo_mercadorias` (campo já consumido pelo app — `EstoqueItem.grupo_mercadorias`). `grp_mercad` é um campo cru duplicado da mesma planilha, sem consumo hoje; fica de fora para não inflar a view sem necessidade.

### `vw_pedidosforn_decorado`

```sql
create or replace view public.vw_pedidosforn_decorado as
select
  p.*,
  td_rc.denominacao as tipo_requisicao_desc,
  td_pc.denominacao as tipo_pedido_desc,
  gm.denominacao as grupo_mercadoria_desc,
  gm.classificacao_nivel1 as grupo_mercadoria_classificacao
from public.pedidosforn p
left join public.cadastro_tipo_documento td_rc
  on td_rc.codigo = p.tpdc and td_rc.categoria = 'B'
left join public.cadastro_tipo_documento td_pc
  on td_pc.codigo = p.tipo_doc_compra and td_pc.categoria = 'F'
left join public.cadastro_grupo_mercadoria gm on gm.codigo = p.grp_mercads;

grant select on public.vw_pedidosforn_decorado to authenticated;
```

Mesma view aplicada a `pedidos` (`vw_pedidos_decorado`) — estrutura idêntica, tabela de origem trocada.

## Verificação

Depois de aplicar e popular:

```sql
-- Toda linha de requisicoes com status_processamento preenchido tem que decodificar
select count(*) from requisicoes r
left join cadastro_status_requisicao st on st.codigo = r.status_processamento
where r.status_processamento is not null and st.codigo is null;
-- esperado: 0

-- Todo tipo_de_documento/tpdc/tipo_doc_compra usado hoje tem que decodificar
select count(*) from requisicoes r
left join cadastro_tipo_documento td on td.codigo = r.tipo_de_documento and td.categoria = 'B'
where r.tipo_de_documento is not null and td.codigo is null;
-- esperado: 0 (idem para pedidos.tpdc/categoria B e pedidos.tipo_doc_compra/categoria F)

-- Grupo de mercadoria: cobertura parcial esperada (só ramo B), não precisa dar 0
select count(*) filter (where gm.codigo is null) sem_cadastro, count(*) total
from estoque e left join cadastro_grupo_mercadoria gm on gm.codigo = e.grupo_mercadorias;
```

## Dados de referência (fonte)

Os dados de carga (INSERTs) vêm literalmente das tabelas coladas pelo usuário nesta conversa. Não há arquivo de origem no repositório — a migration carrega os valores diretamente nos `insert` statements.
