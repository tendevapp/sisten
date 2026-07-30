# Aprovador de Cadastro SAP, PDF em Aprovações, Edição de Cadastro SAP

## 1. Aprovador de Cadastro SAP (aditivo)

### Problema

Hoje, ao criar uma solicitação `cadastro_sap`, a notificação vai automaticamente para todos os usuários com role `coordenador_suprimentos` ou `comprador` (`localDb.ts`, `submitRequest`, branch `cadastro_sap`, linha ~2345). Não há forma de o admin designar responsáveis específicos, como já existe para compras via `aprovador_setores`.

### Modelo de dados

Novo arquivo `adicionar_coluna_aprovador_cadastro_sap.sql` na raiz do repo:
```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aprovador_cadastro_sap boolean NOT NULL DEFAULT false;
```

`src/types.ts`: adicionar `aprovador_cadastro_sap?: boolean` à interface `Profile`, junto de `aprovador_setores`.

### UI

`AprovadorSetoresModal.tsx` ganha uma seção no topo do corpo do modal, acima da lista de setores: checkbox "Também aprovador de Cadastro SAP". Salva via novo `localDb.updateUserAprovadorCadastroSap(userId, boolean)` (mesmo padrão fire-and-forget dos outros updaters).

Na tabela de `AdminPanel.tsx`, a célula "Aprovador" passa a resumir os dois sinais, ex.: `"3 setores + Cadastro SAP"`, `"Cadastro SAP"` (sem setores), `"3 setores"` (sem cadastro SAP) ou `"—"`.

### Notificações (aditivo — regra de role não muda)

Em `submitRequest` (branch `cadastro_sap`, `localDb.ts`): destinatários = união de `coordCompradores` (regra de role atual, inalterada) com usuários que têm `aprovador_cadastro_sap === true`, deduplicados por `id`.

Em `saveRequestEdit`: hoje não existe notificação quando um `cadastro_sap` é editado e reaberto (`novoStatus === 'aberto'`). Adicionar essa notificação usando a mesma lista de destinatários (coordCompradores ∪ aprovadores marcados), por simetria com o que já existe para `compra`.

## 2. Exportar PDF em Aprovações (pendentes + histórico)

### Problema

`Approvals.tsx` não tem exportação de PDF. Diferente de `cadastro_sap` (sem itens, anexos sempre gerais), uma solicitação `compra` tem `RequestItem[]` com anexos por item (`request_item_id` setado) e possivelmente anexos gerais (item removido durante edição, ver `reconciliarItens`).

### Refatoração

Generalizar `src/lib/exportCadastroSapPdf.ts` em um módulo compartilhado `src/lib/pdfExport/`:
- `src/lib/pdfExport/core.ts`: setup do `PDFDocument`, fontes, helpers de wrap de texto/campo, `embedImageAttachment`, `mergePdfAttachment`, função de download do blob final. Reaproveitado pelos dois exports.
- `src/lib/pdfExport/exportCadastroSapPdf.ts`: página de dados do cadastro SAP (comportamento idêntico ao atual, só movido de lugar — reexportado do caminho antigo `src/lib/exportCadastroSapPdf.ts` para não quebrar o import existente em `CadastrosSap.tsx`, ou atualiza o import lá; decisão de implementação, sem mudança de comportamento).
- `src/lib/pdfExport/exportCompraPdf.ts`: nova função `exportCompraPdf(request, sectorName, items, itemAttachments, generalAttachments)`:
  - Página de dados: número, solicitante, setor, criticidade, status, data de necessidade, justificativa.
  - Tabela de itens: descrição, código SAP (ou "sem código"), marca, quantidade, unidade, valor estimado.
  - Para cada item, os anexos daquele item (buscados via `localDb.getAttachments(request.id, item.id)`) embutidos/mesclados em seguida (mesma lógica de imagem/PDF do core).
  - Anexos gerais da solicitação (`localDb.getAttachments(request.id)`, sem itemId) embutidos por último.

### UI

Botão "Exportar PDF" no painel de detalhe de `Approvals.tsx`, próximo ao cabeçalho `#{numero}` (mesma área da "ESTIMATIVA"). Visível em ambas as abas (`pending` e `history`) sempre que há `selectedRequest`. Usa `useToast` para sucesso/erro, com aviso de anexos que falharem (mesmo padrão do Cadastro SAP).

## 3. Editar Cadastro SAP em Minhas Solicitações

### Problema

A edição de `cadastro_sap` já funciona ponta a ponta (`podeEditar`, `statusAposEdicao`, `saveRequestEdit` em `src/lib/solicitacoes.ts`/`localDb.ts`, botão em `MyRequests.tsx`). O bug é em `NewRequest.tsx`: ao carregar uma solicitação `cadastro_sap` existente para edição (efeito ligado a `editandoId`, linhas ~298-346), os campos `sapRegName`/`sapRegSpecs`/`sapRegBrand`/`sapRegVendorInfo` não são recuperados — só o `registration_type`. O texto composto salvo em `justificativa` (formato `"Nome: X. Specs: Y. Justificativa: Z"` para Item, ou `"Nome: X. Justificativa: Z"` para Fornecedor — ver linhas 552-558) não é parseado de volta, então esses campos aparecem em branco na edição e o usuário vê tudo misturado no textarea de justificativa.

### Correção

No efeito de carregamento de `editandoId` em `NewRequest.tsx`, adicionar um parser reverso do texto composto de `justificativa` (regex simples nos prefixos `"Nome: "`, `". Specs: "`, `". Justificativa: "`) que preenche `sapRegName`, `sapRegSpecs` e o `justificativa` (texto restante, sem os prefixos) nos respectivos estados — mesma lógica (adaptada) do restore de rascunho que já existe nas linhas 372-376. `sapRegBrand`/`sapRegVendorInfo` não têm representação recuperável (nunca foram persistidos em nenhum campo, só usados no momento da criação — ver caveat da spec anterior) — ficam em branco na edição, como hoje; não é regressão, é limitação pré-existente fora do escopo desta correção.

## Fora de escopo

- Ação de aprovar/rejeitar cadastro_sap (não existe e não está sendo criada — é só sinalização de quem é notificado).
- Persistir `sapRegBrand`/`sapRegVendorInfo` como campos próprios do `Request` (mudaria o schema além do necessário para esta correção).
- Exportação em lote de múltiplas solicitações de compra.

## Testes manuais

1. Marcar um usuário como "aprovador de Cadastro SAP" (sem tirar coordenador_suprimentos/comprador de ninguém). Criar uma solicitação `cadastro_sap` — confirmar que tanto os coordenadores/compradores quanto o usuário marcado recebem notificação.
2. Editar essa solicitação depois de reaberta — confirmar que os mesmos destinatários recebem uma nova notificação.
3. Em Aprovações, selecionar uma solicitação pendente com itens tendo anexos de imagem e de PDF — exportar PDF e conferir que a tabela de itens e os anexos aparecem no arquivo. Repetir na aba Histórico.
4. Em Minhas Solicitações, editar uma solicitação `cadastro_sap` do tipo Item — confirmar que "Nome do Item" e "Especificações" aparecem preenchidos no formulário de edição, não em branco.
