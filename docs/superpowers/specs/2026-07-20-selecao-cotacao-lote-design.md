# Seleção em lote de itens para envio de cotação + histórico de envio

Data: 2026-07-20
Tela: `src/views/SuppliersNoPO.tsx` ("Itens Sem PO" / Central de Compras)

## Contexto

Hoje o envio de cotação para fornecedores é feito item a item (ou item+fornecedor),
por um botão "Cotação" em cada linha/card, que:

- No modo "Fornecedor primeiro" (tabela) ou clique em um fornecedor específico: abre um
  modal de escolha de escopo ("apenas este item" x "todos os itens deste fornecedor"),
  monta o texto da cotação (`buildQuoteText`) e mostra em um modal de prévia
  (`quoteModal`) com opções de Copiar Texto, Abrir no Outlook (`mailto:`) e WhatsApp.
- No modo "por item" (tabela ou cards), sem fornecedor específico: `handleSendItemQuoteToAllSuppliers`
  monta o `mailto:` direto, com todos os fornecedores históricos do item em BCC — sem
  passar pelo modal de prévia.

Não existe hoje nenhum registro de que uma cotação foi enviada (nem quem, nem quando),
e não existe seleção múltipla de itens em nenhuma tela do sistema.

## Objetivo

1. Permitir marcar vários itens (checkbox) na tabela e nos cards, e enviar uma única
   cotação consolidada para todos os fornecedores envolvidos, através de um botão
   "Enviar Cotação" fora da tabela.
2. Registrar, por item + fornecedor, quem e quando clicou em "Abrir no Outlook", e
   avisar na própria tela de texto da cotação quando aquele item já foi cotado
   anteriormente com aquele fornecedor.

## 1. Seleção em lote

### Estado

- Novo estado `selectedRis: Set<string>` no componente, guardando os `ri` dos itens
  marcados. Um único Set serve para os dois modos de visualização (Cards e Tabela) e
  para os dois sub-modos da tabela ("por item" e "Fornecedor primeiro") — no sub-modo
  "Fornecedor primeiro" o mesmo item pode aparecer em várias linhas (uma por
  fornecedor); marcar qualquer uma marca o item inteiro (mesmo `ri`).
- Ações: `toggleSelectRi(ri)`, `toggleSelectAllVisible()` (marca/desmarca todos os itens
  atualmente visíveis/filtrados), `clearSelection()`.

### UI

- **Tabela**: nova primeira coluna com checkbox por linha (desmarca sozinha se o item
  não tiver `ri`, o que não deveria acontecer) + checkbox "selecionar todos" no
  `<thead>`, refletindo o estado indeterminado quando só parte dos visíveis está
  selecionada.
- **Cards**: checkbox no canto do card, mesmo estado compartilhado.
- **Barra de seleção dinâmica**: aparece apenas quando `selectedRis.size > 0`, entre a
  barra de filtros/busca e a tabela/cards. Contém: "N itens selecionados", botão
  **Enviar Cotação**, botão "Limpar seleção" (secundário).
- Seleção é limpa: ao trocar de filtro relevante não é limpa automaticamente (o usuário
  pode filtrar, selecionar mais itens, filtrar de novo), mas é limpa após um envio bem
  sucedido (clique em "Abrir no Outlook" no modal) ou ao clicar "Limpar seleção".

### Fluxo de envio em lote

1. Usuário marca itens (em qualquer modo/sub-modo) e clica **Enviar Cotação**.
2. Para cada `ri` selecionado, resolve o `ItemNode` (record + fornecedores históricos)
   a partir de `rawRmGroups` (não dos itens filtrados, para não perder itens que saíram
   do filtro após selecionados).
3. Monta texto único via `buildQuoteText` reaproveitado, passando todos os itens
   selecionados (mesmo formato hoje usado para "todos os itens deste fornecedor").
4. BCC = união (sem duplicar por e-mail) dos fornecedores históricos de todos os itens
   selecionados.
5. Abre o mesmo modal de prévia (`quoteModal`), adaptado para aceitar múltiplos
   fornecedores (ver seção "Ajuste no `quoteModal`" abaixo). Título:
   "Cotação — N itens selecionados".
6. Itens sem nenhum fornecedor histórico entram no texto normalmente (ficam com
   "—" no bloco de fornecedor), mas não contribuem fornecedores ao BCC. Se **nenhum**
   item selecionado tiver fornecedor, o botão "Abrir no Outlook" fica desabilitado com
   aviso ("nenhum fornecedor conhecido para os itens selecionados — copie o texto e
   envie manualmente").

### Ajuste no `quoteModal`

Estado atual:
```ts
{ supplier: FornecedorMaterialRow; text: string; rms: string[]; items: QuoteItemEntry[] }
```
Novo formato, compatível com os três fluxos (fornecedor único, item com todos os
fornecedores, lote):
```ts
{
  title: string;              // "Cotação — {fornecedor}" ou "Cotação — N itens selecionados"
  bccSuppliers: FornecedorMaterialRow[]; // 1 ou mais
  toSupplier?: FornecedorMaterialRow;    // preenchido só no fluxo de fornecedor único (usa "to" em vez de BCC)
  text: string;
  rms: string[];
  items: QuoteItemEntry[];
}
```
O botão WhatsApp permanece habilitado apenas quando `toSupplier` está definido (não faz
sentido WhatsApp em lote/BCC).

## 2. Histórico de envio + aviso "cotação já enviada"

### Granularidade

Por **item + fornecedor** (`ri` + `cod_forn`). Um item pode aparecer "já cotado" para o
Fornecedor A e "nunca cotado" para o Fornecedor B.

### Nova tabela Supabase: `cotacao_historico`

Segue o mesmo padrão de `obs_historico` (`src/db/localDb.ts:2597`):

| coluna | tipo | descrição |
|---|---|---|
| id | text (pk) | `ch_<random>` |
| ri | text | item (requisição) |
| rm | text | RM, para exibição |
| cod_forn | text | código do fornecedor |
| fornecedor_nome | text | nome do fornecedor (snapshot, evita join) |
| user_id | text | id do usuário logado |
| user_name | text | nome do usuário logado (snapshot) |
| created_at | timestamptz | data/hora do clique em "Abrir no Outlook" |

Sem `updated_at`/edição — é um log append-only.

### `localDb`

- `logCotacaoEnviada(entries: { ri: string; rm: string; codForn: string; fornecedorNome: string }[]): void`
  — grava local (localStorage, mesma lista em memória usada para consulta rápida) e
  dispara insert assíncrono no Supabase (fire-and-forget, mesmo padrão de
  `updateBuyerFields`), um insert em lote (`insert(entries)`) já que pode ser vários
  itens de uma vez.
- `getCotacaoHistorico(ri: string, codForn?: string): CotacaoHistoricoEntry[]` — filtra o
  cache local carregado.
- Carga inicial: `buildSuppliersData` (ou um método novo `loadCotacaoHistorico`) busca o
  histórico do Supabase filtrado pelos `ri`s presentes na tela (mesmo padrão de tech
  text / histórico de fornecedores, buscado em lotes de 200/500 códigos), e guarda em
  estado local do componente (`Map<string, CotacaoHistoricoEntry[]>` por `ri`).

### Gravação do histórico

No momento em que o usuário clica **"Abrir no Outlook"** dentro do `quoteModal` (os três
fluxos: fornecedor único, item com todos os fornecedores, lote):

- Para cada item em `quoteModal.items`, para cada fornecedor que efetivamente está no
  destinatário/BCC daquele envio (não a lista completa de fornecedores do item — só os
  que estão de fato recebendo este e-mail), grava uma entrada.
- Isso cobre os três fluxos sem lógica especial: fluxo de fornecedor único grava 1
  entrada por item (mesmo fornecedor); fluxo "todos os fornecedores do item" grava 1
  entrada por fornecedor daquele item; fluxo em lote grava o produto de itens ×
  fornecedores efetivamente em BCC.

### Aviso na tela de texto da cotação

No topo do `quoteModal`, antes do textarea, se houver qualquer entrada de histórico
para as combinações item+fornecedor envolvidas nesse envio, mostra um banner (estilo
alerta amber, mesma linguagem visual dos alertas já usados na tela):

> ⚠️ Cotação já enviada anteriormente para 1 ou mais itens/fornecedores desta lista:
> - RM 1234 / Item 10 → Itamar Castro Ribeiro — enviado por André Muritiba em 15/07/2026 14:32
> - RM 1234 / Item 20 → Fornecedor XPTO — enviado por João em 10/07/2026 09:10
>
> _(mostra até 5 linhas, com "+ N outras" se houver mais)_

Não bloqueia o envio — é só informativo. O botão "Abrir no Outlook" continua disponível
normalmente.

## Fora de escopo

- Não altera o botão "Cotação" que já existe por linha/card — ele continua dando o
  mesmo resultado de hoje, só passa a gravar histórico e (quando aplicável) mostrar o
  aviso, por reusar o `quoteModal`.
- Não há bloqueio de reenvio, aprovação, ou notificação para outros usuários — é
  puramente informativo.
- Envio pelo WhatsApp não grava histórico nesta primeira versão (só "Abrir no Outlook").
