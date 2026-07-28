# Anexos de imagem em Solicitação de Compras e Cadastro SAP

## Contexto

Hoje o app tem a *aparência* de anexo, mas nenhum byte é gravado em lugar nenhum:

- `MyRequests.tsx:118` (`handleSimulateAttachmentUpload`) chama `localDb.addAttachment(id, fileName)` passando **só o nome do arquivo**. `size` e `url` ficam com os defaults `0` e `''`.
- `localDb.addAttachment` (`localDb.ts:4930`) grava a linha na chave `sisten_attachments` do cache local. Essa chave não está na lista de sync — não sobe nem desce do Supabase.
- A tabela `public.request_attachments` já existe no Supabase (`id`, `request_id`, `name`, `url`, `size`, `created_at`), com policy `request_attachments_all` (ALL para `authenticated`), e tem **0 linhas**.
- **Nenhum bucket de Storage existe** no projeto.
- Não há nenhuma via de anexo no formulário de criação (`NewRequest.tsx`) — nem para compra, nem para cadastro SAP.

O motor de solicitações inteiro é local-first assimétrico: `submitRequest` (`localDb.ts:2114`) grava **só** no cache local (IndexedDB via `idb-keyval`), enquanto o sync (`localDb.ts:225-228`) **baixa** `requests`, `request_items`, `request_comments` e `request_status_history` do Supabase. Nada sobe. As tabelas remotas estão todas vazias, e é só por isso que o app funciona.

### O risco que isso esconde

`syncSimpleTable` (`localDb.ts:311-322`) é chamado para `requests` com `alwaysSet = false`:

```ts
const rows = await this.fetchAllFromTable<any>(table, '*', 1000, filterFn, orderCol);
if (alwaysSet || (rows && rows.length > 0)) {
  this.setStorageItem(storageKey, rows || []);
}
```

Isso **substitui o array local inteiro** assim que o remoto tiver ≥1 linha. Como o sync dispara em troca de rota, foco de janela e polling, o efeito prático é: **no instante em que a primeira solicitação for inserida no Supabase, todas as solicitações locais de todos os usuários são apagadas**, e qualquer mutação que continue local (assumir atendimento, resolver, comentar, avaliar) é revertida no sync seguinte.

Ou seja, inserir em `requests` não é uma mudança aditiva — sem tratamento, ela vira a chave do motor para autoritativo-no-servidor de uma vez só.

## Decisões

| Questão | Decisão |
|---|---|
| Escopo do que sobe | Anexo **e** a linha da solicitação (`requests` + `request_items`), no caminho de criação |
| Sync | `requests`/`request_items`/`request_attachments` passam a fazer **merge por id** (remoto vence; linha local desconhecida pelo remoto é preservada) em vez de substituição |
| Granularidade (compras) | Anexo preso ao **item** da solicitação |
| Granularidade (cadastro SAP) | Anexo preso à solicitação (não há itens) |
| Momentos | Na criação (`NewRequest`) e depois pelo solicitante (`MyRequests`), enquanto não estiver resolvida/fechada |
| Compressão | Canvas nativo, sem lib nova: lado maior 1200px, WebP qualidade 0.7 |
| Tipos aceitos | Imagens (JPEG, PNG, WebP, HEIC) e **PDF** (passa sem compressão) |
| Limite | 3 arquivos por item / por cadastro SAP; 10 MB por arquivo original |
| Storage | Bucket **privado** `request-attachments`, exibição via signed URL de validade curta |
| Momento do upload | **No submit** — durante o preenchimento os blobs comprimidos ficam em memória |

### Por que upload no submit

Os arquivos são escolhidos antes de a solicitação existir: o `id` só nasce dentro de `submitRequest`, e o id do item é derivado dele (`ri_${request.id}_${index}`, `localDb.ts:2194`). As alternativas eram subir para uma pasta `drafts/` e mover depois, ou gerar o `request_id` na abertura do formulário — ambas deixam arquivos órfãos no Storage sempre que alguém abandona o formulário, exigindo uma rotina de limpeza que não existe no projeto. Como são no máximo 3 arquivos de ~150 KB por item, o custo de segurar os blobs em memória e subir tudo no submit é baixo, e o formulário já exibe barra de progresso no envio (`setUploadProgress`, `NewRequest.tsx:329`).

## Estrutura de dados

### Migration em `request_attachments`

```sql
alter table public.request_attachments
  add column request_item_id text,
  add column storage_path  text,
  add column mime_type     text,
  add column uploaded_by   text,
  add column size_original integer;

create index request_attachments_request_id_idx on public.request_attachments (request_id);
create index request_attachments_request_item_id_idx on public.request_attachments (request_item_id);
```

- `request_item_id` nulável: preenchido nos anexos de item de compra, nulo nos de cadastro SAP.
- `storage_path` é a fonte de verdade para gerar a signed URL. A coluna `url` (`not null`) já existente passa a guardar o mesmo caminho, para não quebrar o schema atual.
- `size` guarda o tamanho **comprimido** (é o que trafega); `size_original` guarda o de origem, para exibir "2,3 MB → 180 KB".

Sem FK para `requests`/`request_items`: as linhas de solicitação são criadas com id gerado no cliente e o motor ainda é local-first — uma FK enforçada quebraria a inserção sempre que a solicitação-pai ainda não tivesse subido.

### Bucket

Bucket `request-attachments`, `public = false`, limite de 10 MB, MIME types restritos a imagem e PDF. Policies de `storage.objects` exigindo `authenticated` para SELECT e INSERT no bucket. Sem DELETE por enquanto — remoção de anexo não faz parte deste escopo.

### Caminho no Storage

```
<request_id>/<request_item_id ou "_geral">/<uuid>.<ext>
```

Prefixo por solicitação para que uma futura policy por dono seja escrita sem migrar arquivo.

## Módulo de compressão — `src/lib/imageCompression.ts`

Uma responsabilidade só: receber um `File` e devolver um blob pronto para upload, ou um erro de validação. Não conhece Supabase, não conhece React.

```ts
export interface PreparedAttachment {
  blob: Blob;
  name: string;          // nome final, com extensão trocada quando convertido
  mimeType: string;
  sizeOriginal: number;
  sizeCompressed: number;
  previewUrl: string;    // object URL para a miniatura; quem consome revoga
}

export async function prepareAttachment(file: File): Promise<PreparedAttachment>;
```

Comportamento:

- **PDF** — passa direto, sem tocar nos bytes. `sizeCompressed === sizeOriginal`.
- **Imagem** — decodifica via `createImageBitmap`, redimensiona proporcionalmente para no máximo 1200px no lado maior (nunca amplia), desenha em `<canvas>` e exporta com `canvas.toBlob(..., 'image/webp', 0.7)`.
- **Fallback de WebP** — se `toBlob` devolver `null` ou um tipo diferente do pedido (navegador sem encoder WebP), repete com `image/jpeg` na mesma qualidade.
- **Fallback de decodificação** — se `createImageBitmap` falhar (HEIC que o navegador não decodifica), o arquivo original sobe sem compressão, desde que respeite o limite de 10 MB.
- **Rede de segurança** — se o resultado comprimido ficar maior que o original (acontece com PNG pequeno já otimizado), mantém o original.
- Rejeita com mensagem em português: tipo não suportado, ou acima de 10 MB.

## Camada de dados — `localDb`

### Sync por merge

Um helper novo `syncMergedTable(table, storageKey, idField)` substitui `syncSimpleTable` para `requests`, `request_items` e `request_attachments`: baixa o remoto, indexa por id, e reescreve o array local como `[...remotas, ...locais cujo id não existe no remoto]`. O remoto vence em conflito de id.

Isso é o que torna a inserção segura: solicitações antigas que só existem no cache do usuário continuam existindo, e as mutações que ainda não migraram para o servidor não são revertidas a cada sync.

`request_attachments` entra na lista de sync (`localDb.ts:213`), que hoje não a inclui.

### `uploadAttachments`

```ts
public async uploadAttachments(
  requestId: string,
  entries: { prepared: PreparedAttachment; requestItemId?: string }[]
): Promise<{ uploaded: number; failed: string[] }>
```

Para cada entrada: `supabase.storage.from('request-attachments').upload(path, blob)`, depois insere a linha em `request_attachments` e no cache local. Uma falha isolada **não** aborta as demais — o método devolve os nomes que falharam, e a UI reporta. A solicitação já foi criada nesse ponto; perder um anexo não pode desfazer a solicitação.

### `getAttachmentUrl`

`createSignedUrl(path, 3600)` com cache em memória por caminho, para não gerar uma assinatura nova a cada re-render da galeria.

### `submitRequest` passa a persistir no Supabase

A assinatura vira assíncrona (`Promise<Request>`). Depois de gravar no cache local exatamente como hoje, faz `upsert` da linha em `requests` e das linhas em `request_items`. Falha de rede é logada e **não** derruba a criação: o comportamento local atual é preservado, e o merge do sync garante que a linha local não seja apagada por não estar no servidor.

### Fora de escopo (dívida registrada)

As demais mutações do motor de solicitações continuam locais: `transitionRequestStatus`, `assignAtendente`, `addRequestComment`, `addComment`, avaliação e transferência de setor. Com o sync por merge isso é seguro — elas não são revertidas —, mas significa que **um atendente em outra máquina vê a solicitação e os anexos, e não vê as mudanças de status feitas por terceiros**. Migrar essas mutações é um trabalho próprio, a ser feito depois.

## UI

### `NewRequest.tsx` — criação

Um componente novo `AttachmentPicker` (`src/components/ui/AttachmentPicker.tsx`), reutilizado nos dois fluxos:

- Botão discreto "Anexar imagem ou PDF" + lista de chips com miniatura, nome, "2,3 MB → 180 KB" e um "×" para remover antes do envio.
- Comprime **na seleção**, não no submit, para que o usuário veja o resultado na hora e o submit só faça rede.
- Desabilita o botão ao atingir 3 arquivos; erros de validação aparecem inline, sem `alert`.

Onde entra:

- **Compra** — dentro de cada linha de item, abaixo dos campos existentes. O estado do item ganha `attachments: PreparedAttachment[]`.
- **Cadastro SAP** — um único picker no bloco do formulário, abaixo da justificativa.

No `handleSubmit`, o `setTimeout(1200)` artificial some: o tempo de espera passa a ser o upload real. Depois do `submitRequest`, chama `uploadAttachments` mapeando o índice do item para `ri_${request.id}_${index}`.

### `MyRequests.tsx` — anexar depois e visualizar

`handleSimulateAttachmentUpload` é substituído pelo caminho real: comprime, sobe, grava. Habilitado enquanto o status não for `resolvido` nem `fechado`. Galeria de miniaturas com signed URL, clicando abre em nova aba.

### `CadastrosSap.tsx` — visualizar

O drawer de detalhe ganha uma seção "Anexos" com as miniaturas da solicitação selecionada. É o que dá sentido ao recurso: o atendente de Suprimentos precisa ver a foto do item ou a ficha técnica para fazer o cadastro. Somente leitura.

## Tratamento de erro

| Falha | Comportamento |
|---|---|
| Arquivo acima de 10 MB ou tipo não aceito | Bloqueado na seleção, mensagem inline, nada é enviado |
| Navegador sem WebP | Fallback automático para JPEG, transparente para o usuário |
| HEIC não decodificável | Sobe o original sem compressão, se couber em 10 MB |
| Upload de um anexo falha | Solicitação criada normalmente; aviso nomeando os arquivos que não subiram |
| Supabase indisponível no submit | Solicitação criada localmente como hoje; anexos não sobem e o aviso informa |
| Signed URL expirada | Regerada na próxima renderização (cache em memória com TTL menor que o da assinatura) |

## Verificação

- `npm run lint` (`tsc --noEmit`) e `npm run build` limpos.
- Teste manual: criar compra com 2 itens, imagem em cada um; conferir no Supabase que subiram 2 objetos no bucket, 2 linhas em `request_attachments` com `request_item_id` distinto, 1 linha em `requests` e 2 em `request_items`.
- Conferir que, após a primeira inserção em `requests`, um segundo navegador **não perde** suas solicitações locais ao sincronizar — é a regressão que o merge existe para evitar.
