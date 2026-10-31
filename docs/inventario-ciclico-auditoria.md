# Inventário Cíclico — preparação, escopo e causas

Implementação de 31/10/2026. Banco exclusivo: `supabase-sisten` (`fwezzgduywgyhxinjurn`).

## Escolha do escopo

Em **Novo inventário → Sugerir escopo rápido**, o tempo é opcional. Pode ser informado em minutos, horas, turnos ou dias. Sem informação, a sugestão usa 30 minutos. Para turno/dia, a premissa inicial é de 8 horas úteis, editável na tela; não são 24 horas corridas. A data da conferência continua disponível no formulário.

A sugestão respeita os filtros atuais e exclui materiais com movimentação pendente conhecida. Prioriza reincidência de divergência, classe A e cobertura (nunca contados ou há mais tempo sem contar). O resultado é ordenado por depósito/endereço para reduzir deslocamento e mantém a seleção manual disponível.

O modelo de tempo é uma **premissa operacional**, não um tempo real já medido nem uma amostra estatística de auditoria:

`estimativa = (5 min de preparação + soma dos tempos dos itens + 1 min por depósito) × 1,20`

O tempo por item começa em 2 minutos, editável. Acrescenta 1 minuto sem localização ou por endereço adicional e 2 minutos para unidades que normalmente exigem medição/pesagem (KG, G, L, M, M2, M3, LT, TON). A seleção só inclui um item se a estimativa inteira couber no tempo disponível. O usuário deve aumentar a premissa para materiais complexos, grandes quantidades, acesso difícil ou contagem por embalagem. A sugestão registra suas premissas na observação do inventário.

## Antes de contar

> **Mudança de 31/10/2026 (tarde):** a preparação deixou de ser obrigatória. A contagem é aceita sempre: se houver rodada liberada e válida com o item na foto, compara com o saldo da foto; senão, com a ZL0024 atual (`alm_inv_saldo_zl0024`), e a contagem fica sem `preparacao_id`. A confirmação "não houve movimentação" e as pendências de saída extraordinária não bloqueiam mais; o painel "Antes de contar" saiu da tela. Quando a contagem diverge, a tela mostra a hora da importação da ZL0024 usada e pede para avisar a gestão. Recontagem continua exigindo causa. Migration `20261031170000_alm_inv_contagem_sem_rodada`. O fluxo abaixo fica como referência do que o banco ainda aceita, se uma rodada for liberada.

1. Abra o inventário e use **Solicitar atualização à gestão**. O sistema registra a solicitação e notifica, dentro do SISTEN, administradores e usuários ativos com liberação explícita `almox_importar_planilhas`. Pedidos ainda abertos são reutilizados para evitar duplicação de avisos.
2. A gestão regulariza os documentos do escopo, extrai novamente a ZL0024 no SAP e importa a nova base. Uma importação anterior à solicitação não libera a rodada.
3. A gestão informa a **hora real da extração**, confirma o controle das movimentações e registra a evidência do corte/responsável/documentos. A hora da importação não é aceita como prova automática da hora da extração.
4. A liberação preserva uma referência de saldo por item, protegida de leitura direta pelo cliente. A janela é configurável de 5 a 120 minutos e termina a partir da **extração**, não da hora em que alguém clicou em liberar.
5. O conferente confirma que contou após a liberação e que não houve movimentação durante a contagem. Se houve entrada, saída ou transferência, deve interromper e pedir nova preparação.

Uma nova versão da ZL0024, uma carga incompleta, o vencimento da janela, uma preparação diferente ou um item acrescentado depois da liberação impedem o envio da contagem. O banco revalida essas condições; não depende apenas do estado do botão no navegador.

Inventários de um turno/dia podem ser feitos em várias rodadas. Cada rodada precisa de uma solicitação, nova extração/importação e liberação. Os saldos usados anteriormente continuam preservados em cada contagem.

## Movimentações que precisam ser regularizadas

O sistema consulta:

- Saídas extraordinárias pendentes de regularização. Como a fonte não informa depósito, o impedimento é conservador para todos os depósitos do material.
- Requisições no Balcão e transferências sem documento SAP ou com documento posterior ao corte, incluindo o depósito de destino da transferência.
- Saídas extraordinárias regularizadas **depois** do corte: dar baixa no documento não atualiza retroativamente a fotografia antiga. É necessária nova ZL0024.

A tela mostra os códigos dos documentos e o motivo. A liberação de um escopo com essas pendências é recusada. Se a pendência surgir depois da liberação, o envio daquele item também é recusado.

## Primeira, segunda e terceira contagens

A primeira diferença é um indício, não uma conclusão sobre perda física. Na segunda e terceira contagens, exige-se causa provável e detalhe/evidência. Também é obrigatório classificar a causa ao encerrar antecipadamente uma divergência.

Opções: em apuração; possível erro de contagem; possível defasagem da ZL0024; movimentação/documento pendente; unidade/embalagem; material em outro endereço; diferença física a investigar; outra causa.

O sistema não confirma automaticamente a causa raiz. Use **Em apuração** quando a evidência for insuficiente. Recomenda outro conferente para a recontagem e oculta as quantidades anteriores na lista/modal enquanto o item estiver aberto. O resultado encerrado e os relatórios mantêm a sequência das contagens para revisão.

Cada contagem registra referência da rodada, início informado pelo aparelho, duração de tela calculada no servidor, usuário autenticado e causa declarada. Essa duração ainda não calibra automaticamente o modelo de escopo: não separa pausas, fotos e deslocamentos de contagem efetiva.

O painel de análise agrupa a última causa declarada por item no recorte atual, incluindo diferenças que foram resolvidas na recontagem. Excel e PDF incluem causas/evidências e a rastreabilidade de cada rodada. Acuracidade e valor do erro continuam separados da hipótese sobre a causa.

## Implantação e compatibilidade

### Inventários simultâneos e seleção exclusiva

Cada **material normalizado × depósito** só pode estar em uma seleção/inventário em andamento. O mesmo material em depósitos diferentes permanece disponível para contagens paralelas. Zeros à esquerda não criam uma segunda identidade para o material.

Ao marcar o item, a tela solicita uma reserva no servidor e só confirma a seleção após a resposta. Outros usuários/abas veem o responsável e o código do inventário ou a indicação de seleção em andamento, com a opção desabilitada. Marcação em lote, sugestão rápida e QR respeitam a exclusividade. A consulta da disponibilidade ocorre a cada 5 segundos; a decisão de reservar é transacional, sem depender desse intervalo de atualização da tela.

O rascunho tem validade de 120 segundos e é renovado a cada 30 segundos enquanto a aba está visível. Fechar/cancelar/limpar libera as reservas temporárias. Se a página fechar sem conseguir enviar a liberação, ou deixar de renovar, elas expiram. Uma sessão de outra aba, inclusive do mesmo usuário, não pode assumir nem liberar uma reserva ainda válida.

Ao salvar, a reserva temporária é transferida para o item do inventário, sem prazo de expiração. Fechar a tela depois de salvar não libera o item. A liberação ocorre quando ele é encerrado/removido ou quando o inventário é concluído/excluído. A reabertura por acréscimo de itens também revalida a exclusividade. Os triggers protegem os fluxos antigos e recusam uma gravação duplicada mesmo que a tela esteja desatualizada.

Migration aplicada: `alm_inv_reserva_concorrente`. Verificação: duas conexões distintas, representando dois usuários ativos, disputaram o mesmo material/depósito; o primeiro manteve a transação aberta por 3 segundos e o segundo foi recusado. Ambas as reservas temporárias de teste foram removidas e a consulta final encontrou zero sobras. O script `scripts/testar-inventario-reservas.sql` também valida duas abas do mesmo usuário, lote sem gravação parcial em caso de conflito, depósitos diferentes, expiração, transferência ao salvar, bloqueio do fluxo legado e liberações. Os testes de preparação/causas foram repetidos após a inclusão das reservas e passaram, com rollback.

A suíte completa passou com 2.522 testes usando quatro workers, após isolar o timeout de SSMA já observado sob carga. Build passou e o TypeScript manteve os mesmos 134 erros anteriores. Validação visual do comportamento entre duas telas ainda pendente; código sem commit/push.

O novo formulário cria inventários com `auditoria_ativa=true`. Inventários anteriores aderem ao solicitar preparação; o histórico importado e as contagens antigas não são reescritos. Os endpoints antigos não permitem contornar a preparação em inventários auditados. O fluxo legado permanece disponível exclusivamente em registros ainda não aderentes, para compatibilidade durante a publicação do aplicativo.

As novas contagens auditadas exigem rede: o servidor precisa validar a preparação vigente. Contagens antigas na fila de um inventário já aderente precisam ser revistas e recontadas presencialmente; não são comparadas silenciosamente com um saldo novo.

Migration aplicada: `alm_inv_preparacao_causas_escopo`. O código do aplicativo ainda precisa de publicação para disponibilizar as novas telas aos usuários.

## Verificação realizada

- 45 testes focados de inventário, incluindo 7 novos casos para orçamento, complexidade, prioridade de risco, pendências e relatórios.
- Suíte completa: **2.522 testes passaram**. Um timeout de SSMA ocorrido durante o primeiro teste concorrente com o build passou isoladamente e na repetição completa. Build final passou. TypeScript manteve os mesmos **134 erros preexistentes**, comparados ignorando somente os números de linha.
- Teste transacional no `supabase-sisten`: solicitação sem duplicação, exigência de nova versão/corte, referência cega, três contagens, causa obrigatória, encerramento antecipado, bloqueio por mudança de base, janela expirada, extraordinária pendente e regularização após o corte, além das permissões dos endpoints.
- As alterações de teste foram revertidas. Nenhuma notificação, solicitação, liberação ou contagem de teste foi mantida; a versão de estoque permaneceu 155, com 31 inventários e 1.721 itens reais.
- Script reproduzível: `scripts/testar-inventario-auditoria.sql`. O teste simula metadados da importação na transação; não comprova uma importação SAP executada por operador nem substitui a validação visual do fluxo.
- Validação visual do navegador permanece pendente. Branch: `feature/inventario-contagem-auditavel`, sem commit/push nesta entrega.

## Melhorias operacionais complementares

Estas medidas exigem execução e decisão da operação; o SISTEN não realiza ajuste automático no SAP:

- **Corte físico/SAP:** preferir bloqueio de movimentações para o material/depósito durante a rodada. Se não for possível, registrar e conciliar cada entrada, saída e transferência com horário e documento antes de liberar novamente.
- **Conciliação completa:** além das saídas conhecidas, revisar recebimentos ainda sem MIGO, devoluções, estornos e transferências em trânsito. A verificação automática desta versão cobre extraordinárias e RQB; não afirma que todas as movimentações SAP estejam disponíveis no SISTEN.
- **Conferência independente:** outro conferente na recontagem e revisão da gestão para a causa raiz e qualquer ajuste. A causa declarada no formulário não deve autorizar uma baixa ou ajuste contábil.
- **Completude física:** realizar também verificações do endereço físico para o cadastro, para encontrar materiais sem registro, em outro depósito, avariados ou vencidos. O escopo rápido é gerado a partir da ZL0024 e não prova que materiais fora dessa base inexistam.
- **Unidade e identificação:** confirmar código, depósito, lote, embalagem e unidade de medida; revisar saldos negativos e endereços ausentes antes de concluir uma divergência.
- **Calibração:** comparar estimativas com rodadas observadas em campo, separando preparação, pausas e contagem. Só depois ajustar os tempos padrão por família/unidade/localização.

O controle de movimentações antes, durante e depois da contagem é parte relevante da obtenção de evidência de inventário ([AUASB, ASA 501, compatível com os tópicos de inventário da ISA 501](https://standards.auasb.gov.au/asa-501-apr-2022)). A SAP descreve o bloqueio de movimentações e o congelamento do saldo contábil no documento de inventário como controles próprios do ERP ([SAP, Conducting Physical Inventory](https://learning.sap.com/courses/inventory-management-and-physical-inventory-in-sap-s-4hana/conducting-physical-inventory)). A referência preservada no SISTEN serve à comparação e à rastreabilidade; não constitui bloqueio de movimentação no SAP.
