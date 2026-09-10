# Almoxarifado — Recebimento de material (ficha cega + contagem)

Data: 2026-09-09

## Problema

O almoxarifado recebe carga de transportadora em campo, sem ferramenta:
o conferente assina o canhoto sem contar volume, abre as caixas depois e,
quando falta item, não há registro do que a transportadora entregou nem do
que o pedido pedia. Divergência de fornecedor não vira não conformidade
rastreável. E o material de projeto (torres GW Jacobina) e o de consumo
entram pelo mesmo portão, mas só o de projeto tem fluxo (entrada de NF com
explosão de BOM, no módulo Projetos).

## Solução — hub de cards, dois formulários

O `/formularios/almoxarifado` é um **hub com cards igual ao da Portaria**
(`PortariaHub`): cada card abre uma vista dedicada; o formulário de
lançamento em si abre como `<Modal>`, como em `PortariaEquipamentos`.

Dois momentos físicos, duas pessoas, dois formulários (não um com abas):

```
DOCA / PÁTIO                       BANCADA / ALMOXARIFADO
F1 · Ficha cega de volumes  ──▶    F2 · Recebimento e contagem
    (RCV)                              (RCM)
- conta caixa/pallet          carga_id  - abre o PO, valida item a item
- foto consolidada da carga   (opcional) - check + qtd + foto + observação
- 30 s, sem abrir volume                 - divergência → NCR consolidada
```

O vínculo `carga_id` é **opcional nos dois sentidos**: dá para conferir um
PO sem ficha cega prévia e registrar uma carga que só será conferida depois.

### F1 — Ficha cega de volumes (`RCV`)

Registro cego do que a transportadora entregou, antes de abrir volume.
Campo de contagem **cego**: a UI só mostra a quantidade declarada depois
que o conferente digita a contada. Foto da carga é **opcional** (até 24 —
nem sempre dá para fotografar na doca). `divergencia = true` quando contou
≠ declarado **ou** avaria aparente — a carga nasce com status `divergente`.

Campos de texto sempre em MAIÚSCULAS; PO só aceita dígitos. O campo
transportadora tem autocomplete (`listarTransportadorasSugeridas`): itens
sem MIGO em `sup_diligenciamento_itens`, cadastro `sup_transportadoras` e as
cargas já lançadas — digitar uma nova a incorpora nas buscas seguintes.

### F2 — Recebimento e contagem (`RCM`)

1. Conferente informa o **nº do PO** (ou escolhe uma ficha cega pendente).
2. A lista de itens do pedido é carregada com **dupla contingência**
   (`fonte_pedido`):
   - `cache_sap` — dataset ZL0132 já sincronizado no aparelho
     (`localDb.getEnrichedSAPRequisicoes()`), instantâneo e **offline**;
   - `supabase` — RPC `alm_receb_po_linhas` lê `sap_zl0132_po` direto
     (aparelho sem cache);
   - `manual` / `sem_pedido` — digitação à mão; o formulário sempre aceita
     "item fora do pedido".
3. Cada linha traz `qtd_pedido` (congelada) e `qtd_ja_fornecida` (snapshot
   de MIGOs anteriores). O conferente ajusta `qtd_recebida` (default = saldo
   pendente), marca `conferido`, `avaria`, escreve observação, tira foto.
4. **Classificação de divergência** (`src/lib/recebimentoAlmox.ts`,
   `classificarDivergencia`, tolerância `EPSILON_QTD` para fracionados):

   | Situação | `tipo_divergencia` |
   |---|---|
   | recebido < pendente | `falta` |
   | recebido > pendente | `excedente` |
   | linha marcada avaria | `avaria` |
   | item manual / sem linha de PO | `sem_pedido` |

   Avaria e material trocado vêm antes da aritmética.
5. Qualquer linha divergente → **uma NCR consolidada** (`alm_receb_nc`),
   com o resumo dos itens e as fotos. Uma por conferência, não por item.
6. `tipo_item` por linha vem do código de material (`isProjetoItem`,
   prefixo 100000). Conferência `misto` quando a lista tem os dois.

## Modelo de dados

`supabase/migrations/20260909170000_create_alm_recebimento.sql`

```
alm_receb_cargas            F1 — ficha cega (código RCV-DDMMYY-NN)
alm_receb_conferencias      F2 — cabeçalho (RCM-DDMMYY-NN)  ── carga_id (nullable)
  alm_receb_conferencia_itens   romaneio congelado + contagem
alm_receb_nc                não conformidade (NCR-DDMMYY-NN) ── conferencia_id
```

Rodapé padrão do repo em todas: `criado_por_id/nome`, `excluido*`,
`created_at`, `unique(codigo)`, RLS `for all using(true)`, grant a
`anon, authenticated, service_role`. Espelha o módulo Projetos.

### Códigos — regra 2 do CLAUDE.md, índice **por dia**

`MODULO-DDMMYY-INDICE`. Prefixos: `RCV`, `RCM`, `NCR`. A doca recebe várias
cargas/dia; sequencial mensal chegaria a três dígitos sem ajudar quem
procura "a segunda carga de hoje". **O código é gerado na RPC**
(`alm_receb_proximo_codigo`), que lê os códigos do próprio dia e ignora a
sugestão do cliente — dois celulares que ficaram offline e voltam juntos
não geram `RCM-090926-03` em duplicata; o `unique` da tabela é a rede final.

## RPCs transacionais

`supabase/migrations/20260909170100_create_alm_recebimento_rpcs.sql`
(`security definer`, `revoke from public/anon`, `grant execute` a
`authenticated`):

- `alm_receb_proximo_codigo(prefixo, data, tabela)` → `PREFIXO-DDMMYY-NN`.
- `alm_receb_po_linhas(pedido)` → linhas do PO de `sap_zl0132_po`
  (contingência do F2 quando o aparelho não tem cache).
- `alm_receb_registrar_carga(p_carga)` → gera código, calcula `divergencia`,
  grava. Exige ≥1 evidência.
- `alm_receb_registrar_conferencia(p_cab, p_itens, p_nc)` → cabeçalho +
  itens + (se `p_nc` e há divergência) a NCR, numa transação; atualiza o
  status da carga vinculada (`conferida` / `divergente`).

## Storage

`bucket alm-recebimento` — privado, 10 MB, imagens + PDF. Foto sempre por
`comprimirImagemUpload` / `prepareAttachment` (regra 1 do CLAUDE.md); o
limite do bucket só barra o acidente. Espelha `proj-evidencias`.

## Projeto × consumo

Formulário idêntico. A diferença é o encaminhamento pós-conferência:

| | Consumo | Projeto (100000…) |
|---|---|---|
| Destino | depósito / localizador → MIGO/estoque | entrada de NF + explosão de BOM no módulo Projetos |
| Contagem | contra `qtd_po` | idem |
| NCR | mesma tabela | mesma tabela |

Quando `tipo_item` ≠ `consumo`, o cartão da conferência mostra
**"Registrar entrada em Projetos →"**, que marca `encaminhado_projetos` e
navega para `/almoxarifado/projetos/recebimento`. O pré-preenchimento
completo da explosão de BOM (bom_linha_id etc.) **não** está neste cut —
hoje é navegação + marcação, a entrada de NF continua sendo lançada lá.

## Arquivos

```
src/lib/recebimentoAlmox.ts           regras puras (divergência, tipo_item, resumo)
src/lib/recebimentoAlmox.test.ts      vitest — 12 casos
src/lib/recebimentoAlmoxApi.ts        RPCs + upload + contingência de PO
src/views/almoxarifado/RecebimentoAlmox.tsx   view (3 abas) + os 2 modais
supabase/migrations/20260909170000_create_alm_recebimento.sql
supabase/migrations/20260909170100_create_alm_recebimento_rpcs.sql
supabase/migrations/20260909170200_create_alm_recebimento_bucket.sql
supabase/migrations/20260909170300_alm_recebimento_rpcs_revogar_anon.sql
supabase/migrations/20260909170400_alm_recebimento_carga_foto_opcional.sql
supabase/migrations/20260909170500_alm_recebimento_edicao_e_log.sql
supabase/migrations/20260910120000_alm_recebimento_multi_po_nc.sql
supabase/migrations/20260910130000_alm_recebimento_pedidos_ordem.sql
src/lib/carimboFoto.ts
```

As 8 migrations foram **aplicadas** ao projeto `fwezzgduywgyhxinjurn` (MCP).
`revoke ... from public` não basta no Supabase — `anon` tem grant direto —,
daí a 170300 (mesmo caso da `proj_rpcs_revogar_anon`).

Rota `/formularios/almoxarifado` (gate `formularios` + form group
`almoxarifado`, hoje `'*'`). Card ativado em `src/views/Formularios.tsx`.

## Entrega parcial na conferência

`20260910140000` — `alm_receb_conferencia_itens.parcial boolean`. Mesma
lógica da Central de Compras (`qtd_fornecida` da ZL0132):

- `carregarLinhasPedido` já traz `qtdJaFornecida` e `pendentePedido` já
  desconta (`qtd_pedido − qtd_fornecida`). Ao puxar um PO com entrega
  parcial, a tela avisa (`entregaParcialAnterior`) e mostra por item
  "já recebido X de Y · pendente Z".
- **Check "parcial"** por linha: chegou menos que o pendente mas está certo
  (o resto vem depois). `classificarDivergencia` passa a devolver `null`
  para `falta` quando a linha é `parcial` — não abre NC. Excedente e avaria
  continuam flagrando. `resumoConferencia` conta `parciais`.
- Visual: linha parcial = borda/realce âmbar + chip "parcial"; distinta do
  verde (ok) e do vermelho (divergência).

## Detalhamento, multi-PO, carimbo de foto, NCR editável

`20260910120000` + `20260910130000`:

- **Detalhamento**: cada cartão (ficha cega / conferência / NCR) abre um
  `ModalDetalhe` read-only com o preenchimento e, **no fim da janela**, o log
  de alterações (`LogAlteracoes`). O botão "Histórico" saiu — o log mora no
  detalhe.
- **Vários POs numa conferência**: campo "Adicionar PO" acumula pedidos; cada
  linha carrega seu `nro_pedido` (coluna nova em `alm_receb_conferencia_itens`),
  `alm_receb_conferencias.pedidos text[]` guarda todos (o `nro_pedido` é o 1º,
  via helper `alm_receb_pedidos_ordenados` que deduplica preservando ordem).
- **Foto por item × foto geral**: a galeria por linha já existia; a foto geral
  do recebimento tem campo separado. Idem ficha cega.
- **Carimbo data/hora**: `src/lib/carimboFoto.ts` (`prepararFotoCarimbada`) —
  uma passada de canvas: redimensiona 1600px, escreve `DD/MM/AAAA HH:MM` numa
  tarja no canto e encoda JPEG. Todas as fotos do módulo passam por ela;
  PDF/HEIC caem no `prepareAttachment` sem carimbo.
- **NCR editável**: `ModalNc` — status/severidade/tipo/responsável/descrição/
  resolução + **registrar ação** (texto + foto, vira entrada em
  `alm_receb_nc.acoes[]`) + fotos gerais. RPC `alm_receb_editar_nc`
  (`security definer`, **sem trava de autor** — a tratativa é de quem conduz),
  loga em `alm_receb_alteracoes` (entidade `nc`). O atalho de status na lista
  passa pelo mesmo RPC, então também loga.

## Edição + log de alterações + exclusão

`20260909170500` — **só quem abriu o registro (ou admin) edita** (helper
`form_pode_editar`, RLS por tabela: SELECT livre, UPDATE/DELETE só autor/
admin em `alm_receb_cargas`/`_conferencias`/`_conferencia_itens`; `_nc` fica
aberta — a tratativa é de terceiros). O cliente espelha com
`podeEditarFormulario(user, row)`.

- **Editar** reabre o mesmo modal preenchido. RPCs `alm_receb_editar_carga` /
  `alm_receb_editar_conferencia` (`security definer`, checam `form_pode_editar`
  por dentro), recalculam `divergencia`/`status`/contadores/`tem_nc`, e a
  edição da conferência **abre uma NCR** se passou a ter divergência e ainda
  não houver uma.
- **Log** em `alm_receb_alteracoes` (`[{campo, de, para}]` + quem + quando),
  escrito só pelas RPCs; a UI mostra em "Histórico" no cartão.
- **Excluir** = soft delete (`excluido_em`): some da tela, permanece no banco.

## Pendente

- Pré-preenchimento real do handoff para a entrada de NF de Projetos (hoje
  é só navegação + `encaminhado_projetos`).
- Etiqueta por volume na ficha cega (decidido: contagem simples por ora).
