# Almoxarifado > Projetos — Editar ordem de pré-montagem

Data: 2026-09-17

## Problema

Uma ordem de pré-montagem (`proj_ordens_premontagem`) hoje nasce e não pode
mais ser corrigida. O único ponto de "edição" é o check item a item
(`marcarItemSeparado`), que a própria RPC trava assim que a separação é
confirmada — porque nesse momento o sistema já debitou o almoxarifado
(`proj_confirmar_separacao_premontagem` grava `proj_movimentos` com
`tipo = 'saida_premontagem'`). Erro de digitação na quantidade de kits, item
separado com quantidade errada depois de confirmado, zona escolhida errada
(só tramo T1) ou ordem aberta por engano: hoje não há saída — nem edição, nem
cancelamento (o `status = 'cancelada'` existe na coluna, mas nenhuma RPC o
usa). Diferente de Recebimento/Sobressalente, que já têm `estornarDocumento()`
para desfazer um documento inteiro, pré-montagem nunca ganhou o equivalente.

## Solução — 5 RPCs dedicadas, uma por tipo de edição

Mesmo padrão de Recebimento de Material
(`alm_receb_editar_carga`/`alm_receb_editar_conferencia`): RPCs
`security definer` separadas por tipo de edição, não uma função genérica —
cada uma tem uma implicação de estoque diferente para misturar num só branch.

```
proj_editar_cabecalho_premontagem   observação, quantidade de kits — sem estoque
proj_adicionar_item_premontagem     insere item novo no romaneio — não debita sozinho
proj_editar_item_premontagem        corrige qtd_separada de 1 item — estorna e relança
proj_trocar_zona_premontagem        recalcula romaneio da zona nova — estorna tudo, reabre separação
proj_cancelar_ordem_premontagem     estorna tudo, status = 'cancelada'
```

### `proj_adicionar_item_premontagem(ordem_id, item_id, subconjunto, qtd_total, localizador)`

Item esquecido na abertura, ou avulso — insere uma linha nova em
`proj_ordens_premontagem_itens` (recusa se o item já estiver no romaneio: aí
é `proj_editar_item_premontagem`/`marcarItemSeparado`, não isto). Nasce com
`separado = false, qtd_separada = 0`, igual a qualquer item da abertura
original:

- Se a ordem ainda não confirmou separação, o item aparece no check físico
  normal (`ModalSeparacao`), junto dos demais.
- Se já confirmou, o usuário usa `proj_editar_item_premontagem` (a mesma
  correção pós-confirmação) para dar a quantidade e debitar — por isso a
  seção "Itens" do modal de edição passou a listar **todos** os itens do
  romaneio quando a separação está confirmada, não só os já separados.
```

Todas soft-deletam o movimento antigo (`excluido = true` em
`proj_movimentos`) em vez de apagar — mesmo mecanismo que
`estornarDocumento()` já usa, e o saldo recalcula sozinho por já ignorar
linhas excluídas. Um movimento de pré-montagem é identificado por
`documento_tipo = 'ordem', documento_id = <ordem.id>` — a confirmação de
separação grava **um movimento por item** dentro desse mesmo `documento_id`
(ver `proj_confirmar_separacao_premontagem`, migration
`20260909130228`), então dá para estornar granular por item
(`documento_id + item_id`) ou tudo de uma vez (`documento_id` sozinho).

### `proj_editar_cabecalho_premontagem(ordem_id, observacao, quantidade_kits)`

Sempre disponível, antes ou depois da separação confirmada — não toca em
estoque. Só atualiza `proj_ordens_premontagem.observacao`/`quantidade_kits`.
**Não** cria nem apaga linhas de `proj_kits`: se o número de kits precisar
mudar de verdade (mais/menos tramos-alvo), isso continua exigindo abrir outra
ordem — esta RPC só corrige o número informado.

### `proj_editar_item_premontagem(ordem_id, item_id, nova_qtd_separada)`

Só faz sentido — e só é chamada pela UI nova — **depois** que a separação já
foi confirmada. Antes disso, o check físico continua sendo
`proj_marcar_item_ordem_premontagem` (existente, sem trava de autor): é
tarefa compartilhada de quem está na bancada separando, não "edição de
registro próprio" — gatear por `form_pode_editar` quebraria o fluxo de hoje,
em que qualquer um com a permissão `proj_lancar_premontagem` faz o check.

A RPC nova:

1. Confere `form_pode_editar` (autor da ordem ou admin) e que a ordem
   **tem** `separacao_confirmada_em` — se não tiver, orienta a usar o check
   normal em vez desta RPC.
2. Soft-deleta o(s) movimento(s) ativo(s) com
   `documento_id = ordem_id and item_id = item_id and tipo = 'saida_premontagem'`,
   valida saldo da nova quantidade (`proj_validar_saldo`, mesma função que a
   confirmação já usa) e insere um novo movimento com a quantidade corrigida
   (pula o insert se `nova_qtd_separada = 0`). Atualiza `qtd_separada` no
   romaneio.
3. Grava no log (ver abaixo) o valor antigo e o novo.

### `proj_trocar_zona_premontagem(ordem_id, nova_zona)`

A operação mais invasiva: muda **qual fatia da BOM** compõe o romaneio da
ordem. Passo a passo:

1. Soft-deleta **todos** os movimentos ativos da ordem
   (`documento_id = ordem_id`) — devolve ao almoxarifado tudo que essa ordem
   já havia debitado, de qualquer zona.
2. Apaga as linhas atuais de `proj_ordens_premontagem_itens` e insere o
   romaneio novo, recalculado a partir da BOM filtrada pela zona nova (mesma
   lógica de cálculo que a abertura da ordem já usa no cliente —
   `consumoDaZona`/`filtroDaZona` em `src/lib/projetosZonas.ts` — só que
   agora rodando de novo a partir do zero, não na criação).
3. `separacao_confirmada_em = null`, `zona = nova_zona` — a ordem volta ao
   estado "em picking", com nenhum item separado.

A UI avisa explicitamente antes de confirmar: **"trocar a zona desfaz toda a
separação já feita nesta ordem; o estoque debitado será devolvido e será
preciso separar de novo."**

### `proj_cancelar_ordem_premontagem(ordem_id, motivo)`

Soft-deleta todos os movimentos ativos da ordem (`documento_id = ordem_id`) e
seta `status = 'cancelada'`. **Não mexe em `proj_kits`** nem em
`proj_tramos_gwjaco.status`: um kit é compartilhado por `tramo_unidade_id`
entre zonas diferentes (`on conflict (projeto, rastreio) do nothing` na
abertura), e mais de uma zona pode estar `em_premontagem` para o mesmo tramo
ao mesmo tempo — reverter o status do tramo aqui poderia reabri-lo enquanto
outra ordem/zona ainda está em andamento nele. Ver "Riscos" abaixo.

## Permissão e log

RLS das 3 tabelas (`proj_ordens_premontagem`, `_itens`, `_alvos`) é hoje
`for all using (true)` — sem noção de dono. Passa a:

- **SELECT**: livre, como está.
- **UPDATE/DELETE**: só autor ou admin, via `form_pode_editar(criado_por_id)`
  — mesma função já usada em Recebimento e nos 13 formulários do padrão
  autor/admin. `criado_por_id` já existe na tabela hoje.
- As 5 RPCs continuam `security definer`, mas cada uma confere
  `form_pode_editar` por dentro antes de agir (a RLS de tabela sozinha não
  barra `security definer`; a checagem explícita é o que efetivamente
  protege).

Nova tabela `proj_ordens_premontagem_alteracoes` — mesmo formato de
`alm_receb_alteracoes`: `ordem_id`, `alteracoes jsonb` (`[{campo, de, para}]`),
`criado_por_id/nome`, `created_at`. Cada RPC grava uma linha só se algo de
fato mudou (compara valor antigo vs. novo antes do `update`), exceto
`proj_adicionar_item_premontagem`, que sempre loga (é sempre uma novidade).

## UI

`src/components/projetos/PainelPremontagem.tsx` ganha:

- Botão **"Editar"** no cartão da ordem, visível quando
  `podeEditarFormulario(user, ordem)` retorna `true` — reaproveitado direto
  de `src/lib/permissoesFormularios.ts`, sem precisar de helper novo:
  `ComDono` já reconhece `criado_por_id`, que a ordem já tem.
- Novo `ModalEditarOrdemPremontagem` com 4 blocos:
  1. **Cabeçalho** — observação, quantidade de kits. Sempre habilitado.
  2. **Adicionar item** — busca no catálogo do projeto, quantidade e
     subconjunto opcional. Insere uma linha nova no romaneio
     (`proj_adicionar_item_premontagem`); não debita sozinho.
  3. **Itens** — só aparece quando a ordem já tem separação confirmada (antes
     disso, o check físico de sempre resolve, inclusive para itens recém-
     adicionados). Lista **todo** o romaneio (não só os já separados, para
     os recém-adicionados aparecerem com quantidade zero) com a quantidade
     editável por linha e um aviso fixo no topo sobre o ajuste automático de
     estoque.
  4. **Ações de risco** — "Trocar zona" (só aparece se `ordem.tramo === 'T1'`)
     e "Cancelar ordem", cada uma atrás de uma confirmação que explica o que
     será desfeito antes de executar.
- Log de alterações visível no próprio modal ("Histórico de alterações",
  carregado sob demanda), lendo `proj_ordens_premontagem_alteracoes`.

## Riscos e decisões a confirmar no plano

- **`proj_kits`/`proj_tramos_gwjaco.status` no cancelamento**: cancelar uma
  ordem não reverte o tramo para `pendente` nem mexe no kit associado, porque
  outra zona do mesmo tramo pode estar ativa. Se, ao cancelar, **nenhuma
  outra ordem não-cancelada/não-concluída** existir para o(s) mesmo(s)
  `tramo_unidade_id`, faz sentido reabrir o tramo — mas isso é uma consulta a
  mais e um efeito colateral que vale confirmar durante a implementação, não
  travar o design nisso agora.
- **Trocar zona e `proj_kits`**: como o kit é por `tramo_unidade_id` (não por
  zona), trocar a zona de uma ordem não deveria precisar tocar no kit — mas
  vale um teste manual cobrindo esse caminho.
- **Aumentar a quantidade separada de um item** (não só corrigir para menos)
  precisa validar saldo disponível igual à confirmação original
  (`proj_validar_saldo`) — incluído no desenho da RPC acima, mas é o ponto
  onde um erro de concorrência (dois usuários editando ordens diferentes que
  disputam o mesmo saldo) é mais provável; sem lock explícito por ora, igual
  ao resto do módulo.

## Arquivos (implementados)

```
supabase/migrations/20260917100000_proj_premontagem_rls_autor_admin.sql
supabase/migrations/20260917100100_proj_premontagem_editar_rpcs.sql
supabase/migrations/20260917110000_proj_premontagem_adicionar_item_rpc.sql
src/lib/projetosApi.ts                         + 5 funções novas (chamam as RPCs)
src/lib/permissoesFormularios.ts               (reaproveitado, sem mudança)
src/components/projetos/ModalEditarOrdemPremontagem.tsx   novo
src/components/projetos/PainelPremontagem.tsx  + botão Editar + wiring
```

As 3 migrations ainda **não foram aplicadas** ao banco (MCP do Supabase
indisponível durante a implementação) — pendente rodar antes de usar em
produção.
