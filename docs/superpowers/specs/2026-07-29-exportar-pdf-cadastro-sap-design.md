# Exportar PDF — Cadastro SAP

## Problema

Na tela de Cadastro SAP (`src/views/CadastrosSap.tsx`), não há forma de exportar uma solicitação individual para PDF. Usuários que precisam arquivar ou compartilhar o registro completo (dados do cadastro + anexos) precisam copiar informações manualmente.

## Objetivo

Adicionar um botão "Exportar PDF" no drawer de detalhe de uma solicitação `cadastro_sap`, que gera um único arquivo PDF contendo todos os campos do cadastro e todos os anexos (imagens e PDFs) embutidos.

## Biblioteca

Adicionar `pdf-lib` como dependência (`npm install pdf-lib`). Geração 100% client-side. Escolhida em vez do padrão existente "PDF via impressão do navegador" (usado em `RastreioCompras.tsx`) porque esse padrão não consegue mesclar anexos que já são arquivos PDF (só consegue encaixar imagens como `<img>`) — `pdf-lib` permite tanto desenhar texto/imagens quanto mesclar páginas de PDFs existentes no mesmo documento de saída.

## Ponto de entrada

Botão "Exportar PDF" (ícone `FileText`, mesmo padrão visual do botão de PDF em `RastreioCompras.tsx`) no cabeçalho do drawer de detalhe em `CadastrosSap.tsx`, ao lado do botão "Fechar" (linhas ~445-450). Visível sempre que há uma solicitação `cadastro_sap` selecionada (`selectedReq`).

## Geração do PDF

Novo módulo `src/lib/exportCadastroSapPdf.ts`, exportando uma função `exportCadastroSapPdf(request: Request, attachments: RequestAttachment[]): Promise<void>` que:

1. Cria um `PDFDocument` via `pdf-lib`.
2. **Página de dados**: desenha via `drawText` os campos do cadastro — número, tipo de registro (Item/Fornecedor), nome do solicitante, setor solicitante, criticidade, status, data de criação, e o texto de `justificativa` (que já contém nome/especificações/marca/fornecedor sugerido, conforme montado em `NewRequest.tsx`). Quebra de linha simples por largura de página; se o texto não couber em uma página, continua em página(s) adicionais.
3. **Anexos**: para cada `RequestAttachment` (obtidos via `localDb.getAttachments(reqId)` no chamador, URL resolvida via `localDb.getAttachmentUrl(...)`, conteúdo via `fetch(url).then(r => r.arrayBuffer())`):
   - Se `mime_type` é imagem (`image/jpeg`, `image/png`, etc.): `pdfDoc.embedJpg`/`embedPng` conforme o tipo, adiciona nova página dimensionada para caber a imagem (mantendo proporção, largura máxima = largura da página).
   - Se `mime_type` é `application/pdf`: `PDFDocument.load(bytes)` e `pdfDoc.copyPages(anexoDoc, anexoDoc.getPageIndices())`, anexando todas as páginas do anexo ao final do documento final.
   - Se um anexo falhar ao baixar ou embutir (erro de rede, tipo inesperado), o erro é capturado, o anexo é pulado, e a função devolve ao chamador a lista de anexos que falharam (para o componente mostrar um toast de aviso) — a exportação não é abortada por causa de um anexo problemático.
4. Serializa (`pdfDoc.save()`) e devolve os bytes; o componente chamador cria um Blob e dispara o download (`a.click()` com `URL.createObjectURL`), nome de arquivo `cadastro-sap-{numero}.pdf`.

## Integração em `CadastrosSap.tsx`

- Novo handler `handleExportPdf()`: busca anexos via `localDb.getAttachments(selectedReq.id)`, chama `exportCadastroSapPdf`, mostra toast de sucesso/erro (incluindo aviso por anexo pulado, se houver).
- Estado de loading local (`exportingPdf: boolean`) para desabilitar o botão durante a geração (evita cliques duplicados enquanto anexos grandes são baixados).

## Fora de escopo

- Histórico de comentários e mudanças de status da solicitação (não entram no PDF).
- Exportação em lote de múltiplas solicitações.
- Outros tipos de solicitação (`compra`, `chamado`) — este botão é específico da tela Cadastro SAP.

## Teste manual

1. Abrir uma solicitação `cadastro_sap` com pelo menos um anexo de imagem e um anexo em PDF.
2. Clicar "Exportar PDF" e conferir que o arquivo baixado contém: página de dados com todos os campos, seguida da imagem embutida e das páginas do PDF anexado.
3. Repetir com uma solicitação sem nenhum anexo — deve gerar só a página de dados, sem erro.
4. Simular falha de rede num anexo (ex. URL expirada) — a exportação deve completar com os anexos restantes e avisar sobre o que faltou.
