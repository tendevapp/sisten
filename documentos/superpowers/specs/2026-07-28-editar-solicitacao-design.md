# Editar solicitação

## Contexto

O gestor pode devolver uma solicitação de compra com "Solicitar revisão", que a move para `em_revisao` (`Approvals.tsx:84`). Esse status é exibido em quatro telas — `Dashboard`, `MyRequests`, `Approvals`, `Reports` — e **ninguém pode agir sobre ele**: não existe tela de edição. O gestor pede a revisão e o solicitante não tem como revisar. Esta funcionalidade fecha o ciclo.

O mecanismo existe pela metade. `submitRequest` (`localDb.ts:2160`) já aceita `draft.id` e, nesse caminho, atualiza a solicitação em vez de criar outra. O que falta é a interface que carregue uma solicitação existente nesse caminho.

### O problema do id de item

`submitRequest` **recria os itens do zero** a cada gravação, derivando o id do índice:

```ts
const newItems = draft.items.map((item, index) => ({
  ...item,
  id: `ri_${request.id}_${index}`,
  request_id: request.id
}));
```

Os anexos de item apontam para esse id (`request_attachments.request_item_id`). Remover ou reordenar um item numa edição desloca os índices, e os anexos passam a apontar para o item errado.

A causa não é falta de id — os itens **já têm id gravado** em `request_items`. É a recriação por índice que destrói o vínculo. Preservar o id que veio resolve o problema **sem migração de dados**: os três anexos hoje em produção continuam corretos.

## Decisões

| Questão | Decisão |
|---|---|
| Quando editar | Compra: `pendente`, `em_revisao`, `rejeitada` e também `aprovada`. Demais tipos: enquanto não encerrada |
| Tipos | Os três |
| Quem | Apenas quem abriu a solicitação |
| Identidade do item | Id estável, preservado na edição; item novo recebe `ri_` + UUID |
| Tela | Reaproveita o formulário de Nova Solicitação, em modo edição |

### A ressalva de editar após aprovada

Editar uma solicitação já aprovada desfaz a aprovação, e o comprador pode já ter trabalhado nela. A decisão foi consciente. A mitigação é notificar: nesse caso específico, o gestor do setor e o comprador designado recebem aviso de que a solicitação voltou para aprovação. Sem isso o trabalho do comprador evaporaria em silêncio.

## Identidade do item

`PurchaseItemState` ganha `id?: string`. Ao carregar para edição, os ids vêm do banco; ao salvar, item existente mantém o seu e item novo recebe `ri_` + UUID. O índice deixa de participar da identidade.

### Item removido

Hoje `submitRequest` remove os itens do cache local, mas `publishRequest` só faz upsert — o item removido continuaria vivo no servidor. Passa a apagá-los explicitamente por id.

Os anexos do item removido **não são apagados**: passam para o nível da solicitação (`request_item_id = null`). Nada se perde, nada aponta para item inexistente, e não é preciso criar policy de DELETE no Storage — deliberadamente ausente desde o design de anexos.

## Regras — `lib/solicitacoes.ts`

```ts
export function podeEditar(r: Request, user: Profile): boolean;
```

Só o autor (`solicitante_id === user.id`). Para `compra`, permite em `pendente`, `em_revisao`, `rejeitada` e `aprovada`. Para `cadastro_sap` e `chamado`, permite enquanto não estiver `resolvido`, `fechado` ou `cancelada`.

```ts
export function statusAposEdicao(tipo: RequestType): RequestStatus;
```

`compra` volta a `pendente` — precisa de aprovação de novo. Os demais voltam a `aberto`.

## Efeito de salvar — `localDb`

Um método próprio, `saveRequestEdit`, em vez de sobrecarregar `submitRequest` com mais um modo: a edição tem efeitos que a criação não tem (perder o atendente, registrar no histórico, notificar) e misturá-los tornaria os dois caminhos difíceis de ler.

O método:

1. Atualiza os campos editáveis da solicitação e move o status conforme `statusAposEdicao`.
2. Limpa `atendente_id`/`atendente_name` quando o tipo volta para `aberto` — a solicitação retorna à fila e quem atendia não está mais designado.
3. Reconcilia os itens por id: mantém os existentes, insere os novos, apaga localmente e no servidor os que sumiram, e repassa os anexos dos removidos para o nível da solicitação.
4. Publica no Supabase (`publishRequestRow` + itens).
5. Registra no histórico via `logStatusChange`, com "Solicitação editada pelo solicitante".
6. Se o status anterior era `aprovada`, notifica o gestor do setor e o comprador designado.

## Interface

### `MyRequests`

Botão "Editar solicitação" no painel de detalhe quando `podeEditar` for verdadeiro, navegando para `/solicitacoes/nova?editar=<id>`.

### `NewRequest` em modo edição

Ao detectar `?editar=<id>`, carrega a solicitação e seus itens, trava o seletor de tipo (mudar o tipo de uma solicitação existente não faz sentido) e ajusta o texto: título "Editar Solicitação", botão "Salvar alterações" e um aviso de que a solicitação voltará para aprovação.

**Não toca no rascunho automático.** O autosave existe para uma solicitação sendo criada; deixá-lo ativo na edição faria uma solicitação real sobrescrever o rascunho que o usuário estava montando. Em modo edição, `saveDraft` e `clearDraft` não são chamados e o rascunho salvo não é carregado.

Os anexos já enviados aparecem como somente-leitura, pela galeria existente; anexos novos podem ser acrescentados e sobem ao salvar. Remover anexo continua fora de escopo.

## Tratamento de erro

| Falha | Comportamento |
|---|---|
| `?editar=<id>` inexistente ou de outro usuário | Redireciona para Minhas Solicitações; nada é carregado |
| Solicitação deixou de ser editável entre abrir e salvar | `saveRequestEdit` recusa e avisa; o estado local não é alterado |
| Publicação no Supabase falha | Edição permanece no cache local; o sync por merge não a apaga |
| Anexo novo falha ao subir | Edição é salva; os nomes que falharam são reportados |

## Verificação

- `npm run lint` (`tsc --noEmit`) e `npm run build` limpos.
- Exercitar contra o banco, em transação revertida: reconciliação de itens (um mantido, um novo, um removido) e o repasse do anexo do item removido para o nível da solicitação.
- Conferir que o id do item **não muda** ao editar sem mexer nos itens — é a regressão que preserva os anexos em produção.
