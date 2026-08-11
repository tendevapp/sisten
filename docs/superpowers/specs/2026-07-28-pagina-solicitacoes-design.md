# Página Solicitações, papel Requisitante e migração das mutações

## Contexto

O módulo SOLICITAÇÕES tem hoje três páginas (`src/lib/pages.ts:40-44`):

- `/solicitacoes/nova` — criação, aberta a todos;
- `/solicitacoes/minhas` — acompanhamento das próprias, aberta a todos;
- `/solicitacoes/aprovacoes` — fila de aprovação do gestor, restrita a `gestor` e `admin`.

Falta a visão coletiva: quem opera a fila não tem onde ver todas as solicitações abertas, responder e extrair dados.

### O fluxo de aprovação já existe

`Approvals.tsx` move a solicitação de compra de `pendente` para `aprovada`, `rejeitada` ou `em_revisao` (`Approvals.tsx:82-83`). Portanto **"aguardando aprovação" não é um status novo** — é o rótulo de `pendente` em solicitação do tipo `compra`. Cadastro SAP e chamado nascem `aberto` e não passam pelo gestor.

### O bloqueio real

Depois do trabalho de anexos (`2026-07-28-anexos-imagens-design.md`), a **criação** de solicitação publica no Supabase, mas as mutações seguintes continuam locais: status, atendente, comentários e histórico. Numa página cujo propósito é acompanhar o andamento coletivo, isso significaria cada usuário vendo um status diferente da mesma solicitação — o gestor aprova e ninguém mais fica sabendo.

Migrar essas mutações é pré-requisito da página, não um extra. É a dívida registrada no design anterior, e esta funcionalidade a torna obrigatória.

## Decisões

| Questão | Decisão |
|---|---|
| Motor | Migrar as mutações para o Supabase junto com a página |
| Abordagem | Escrita direta em cada método do `localDb` (não outbox, não RPC) |
| Papel | `requisitante` novo, separado de `solicitante` |
| O que o requisitante faz | Vê e responde **todas** as solicitações; o solicitante só as próprias |
| Tipos listados | Os três (compra, cadastro SAP, chamado), com filtro |
| Visibilidade | Gestor vê o próprio setor; requisitante, comprador, coordenador e admin veem tudo |
| Responder | Comentário na thread `request_comments` existente |
| Exportação | XLSX, uma linha por item |
| Download de anexos | Downloads individuais em sequência |

### Por que escrita direta

As alternativas eram uma fila de escritas pendentes (outbox), que resolveria o caso offline ao custo de uma máquina de estado nova com ordenação e conflito, e mover as transições para RPC no Postgres, que é o destino correto a longo prazo mas jogaria fora a lógica de SLA, notificação e histórico que hoje vive no `localDb`. A escrita direta continua o padrão de `publishRequest`, já no código, e é a única que cabe no mesmo trabalho da página.

## Papel `requisitante`

`profiles.roles` é `text[]` **sem constraint de valores**, e `has_role(text)` testa pertinência no array. O papel novo não exige migration de coluna nem de enum.

Muda em três lugares no app: o tipo `Role` (`src/types.ts:7`), a lista de papéis da tela de Usuários (`AdminPanel.tsx:520`) e os `defaultRoles` da página nova.

No banco, muda uma coisa só — a policy `requests_read`, que hoje enumera `admin`, `coordenador_suprimentos`, `comprador`, `atendente`, `gestor` e `visualizador`. Sem `requisitante` nessa lista, o requisitante só leria as próprias solicitações (pelo ramo `solicitante_id = auth.uid()`) e a página nasceria vazia justamente para o papel criado para ela.

### Limite conhecido

A `requests_read` permite ao **gestor ler todas** as solicitações; o recorte "só o meu setor" é regra de tela, exatamente como `Approvals.tsx:137` já faz. Esta mudança não piora isso, mas também não o corrige: a restrição por setor não é barreira de banco. Endurecer a RLS por setor é trabalho próprio, fora deste escopo.

## Migração das mutações

Seis métodos do `localDb` passam a publicar no Supabase depois de gravar no cache local, seguindo o padrão de `publishRequest`: falha de rede é registrada e não desfaz a escrita local, e o sync por merge impede que o servidor apague o que ainda não subiu.

| Método | Tabela |
|---|---|
| `transitionRequestStatus` (`localDb.ts:2382`) | `requests` |
| `updateRequestStatus` (`localDb.ts:4992`) | `requests` |
| `assignAtendente` (`localDb.ts:2438`) | `requests` |
| `logStatusChange` (`localDb.ts:2420`) | `request_status_history` |
| `addComment` (`localDb.ts:5021`) | `request_comments` |
| `addRequestComment` (`localDb.ts:2137`) | `request_comments` |

`request_comments` e `request_status_history` já têm policy `ALL` para `authenticated` — nada a criar no banco.

Todos viram assíncronos. Chamadores a ajustar: `Approvals.tsx:86`, `Helpdesk.tsx` (76, 82, 95 e dois `addComment`), `CadastrosSap.tsx` (cinco pontos entre `assignAtendente`, `transitionRequestStatus` e `addRequestComment`) e `MyRequests.tsx` (`addComment`).

`request_comments` sai de `syncComments` para o sync por merge, pelo mesmo motivo das outras tabelas de solicitação: substituir o array local apagaria comentários ainda não publicados.

**Fora de escopo:** notificações e `activity_logs`. São derivados — cada cliente os recria a partir do que sincroniza —, e publicá-los multiplicaria a escrita sem ninguém consumindo do servidor.

## Página Solicitações

Rota `/solicitacoes/todas`, id `sol_todas`, grupo `SOLICITAÇÕES`, `defaultRoles: ['requisitante', 'gestor', 'comprador', 'coordenador_suprimentos', 'admin']`.

Arquivo novo `src/views/Solicitacoes.tsx`, com a lógica de recorte e exportação extraída para `src/lib/solicitacoes.ts` — a view fica com a interface, o módulo com as regras, que assim podem ser lidas e ajustadas sem abrir um arquivo de tela.

### Recorte por papel

`solicitacoesVisiveis(todas, user)`: gestor recebe apenas as do próprio setor; requisitante, comprador, coordenador e admin recebem todas. Uma função só, para a regra não se espalhar pela tela.

### Lista

Colunas: seleção, número, tipo, solicitante e setor, criticidade, status, data de abertura. Filtros de tipo, status, criticidade, setor e busca textual. Sobre as primitivas de `components/ui/DataTable.tsx`, em vez de mais uma tabela manual — o projeto já tem quatro telas nesse padrão.

Rótulo de status: `pendente` em solicitação de compra é exibido como **"Aguardando aprovação"**; nos demais casos vale o rótulo corrente.

### Painel de resposta

Ao selecionar uma linha, abre o detalhe com os itens, a galeria de anexos (`AttachmentGallery`, já existente) e a thread de comentários, com campo de resposta. O marcador de comentário interno fica disponível para `comprador`, `coordenador_suprimentos` e `atendente`, como o tipo `RequestComment.is_internal` já prevê.

O painel **não** move status: aprovar segue em Aprovações, atender segue em Cadastros SAP e Helpdesk. Duplicar as ações espalharia a regra por mais uma tela.

## Exportação e download

Checkbox por linha e um "selecionar todas as filtradas" no cabeçalho.

**Exportar XLSX** — via a lib `xlsx`, já usada em seis telas. Uma linha por item da solicitação, repetindo as colunas de cabeçalho (número, tipo, status, solicitante, setor, criticidade, datas, comprador). Cadastro SAP e chamado, que não têm itens, saem em linha única com as colunas de item vazias.

**Baixar imagens** — resolve a URL assinada de cada anexo das solicitações selecionadas (`localDb.getAttachmentUrl`) e dispara os downloads em sequência, com o nome prefixado pelo número da solicitação. O navegador pede autorização uma vez para downloads múltiplos; autorizada, o lote segue.

## Tratamento de erro

| Falha | Comportamento |
|---|---|
| Publicação de mutação falha | Escrita local permanece; erro no console; sync por merge não a apaga |
| Requisitante sem a policy atualizada | Página vazia — por isso a policy entra na mesma migration |
| Nenhuma linha selecionada | Botões de exportar e baixar desabilitados |
| Seleção sem nenhum anexo | Aviso de que não há imagens a baixar |
| URL assinada falha para um anexo | Os demais seguem; os que falharam são nomeados ao final |

## Verificação

- `npm run lint` (`tsc --noEmit`) e `npm run build` limpos.
- Exercitar contra o banco real, em transação revertida, o `update` de status e os inserts de `request_status_history` e `request_comments` com os formatos exatos que o app envia.
- Conferir que a policy atualizada deixa um perfil com papel `requisitante` ler solicitação de terceiro.
- Teste manual: aprovar uma compra em Aprovações e confirmar que a página Solicitações reflete a mudança em outro navegador — é a regressão que toda a migração existe para resolver.
