# Trilha Gamificada · PO.ALM-0001 (Rotinas do Almoxarifado)

- **Código:** PO.ALM-0001
- **Revisão:** 05 (17/06/2026)
- **Emissor:** Jamille da Silva Batista
- **Aprovador:** Gilmara Moura de Souza
- **Arquivos:**
  - Standalone: `public/treinamentos/trilha-po-alm-0001-standalone.html`
  - Incorporação SISTEN: `public/treinamentos/trilha-po-alm-0001.html`
  - Definição das Missões: `.agents/skills/trilha-gamificada-po/assets/motor/missions-alm0001.js`
- **Total de Missões:** 10 missões (44 cenas, 10 jogos, 44 perguntas de quiz, 2 simuladores interativos).
- **Duração Estimada:** ~50 minutos.

---

## Estrutura das Missões

1. **Missão 01 · Por que o Almoxarifado existe**
   - *Foco:* Controle físico e contábil, integridade de estoque, definições de matéria-prima e materiais segregados, estoques mínimos e pontos de ressuprimento.
   - *Jogo:* Quem faz o quê no Almoxarifado? (Almoxarifado x Controladoria x Suprimentos x Qualidade).
   - *Insígnia:* Guardião da Acuracidade.

2. **Missão 02 · Gestão Sistêmica e Ressuprimento**
   - *Foco:* Monitoramento diário de consumo, definição de itens para estoque (FRM.ALM-0015), criação de Requisições de Compra no SAP (ME51N) e aprovação pelo Coordenador de Logística e Almoxarifado.
   - *Simulador:* `ressup` (Estoque Atual x Estoque Mínimo x Ponto de Ressuprimento).
   - *Jogo:* Ressuprimento Certo: o que fazer?
   - *Insígnia:* Vigia do Estoque.

3. **Missão 03 · Chegada e Recepção da Carga**
   - *Foco:* EPIs de campo obrigatórios, check-list de empilhadeira (FRM.SEG-0011), isolamento da área de descarga, checagem da NF (dados TEN e volumes), inspeção visual com foto e carimbo provisório "Sujeito a conferência posterior" (Anexo I).
   - *Jogo:* Ordem da Recepção (sequência obrigatória).
   - *Insígnia:* Porteira Blindada.

4. **Missão 04 · Conferência e Destino dos Materiais**
   - *Foco:* Contagem detalhada (unitária/amostral) x Pedido de Compra, liberação de laudos (FISPQ, Certificados de Qualidade e Aferição) pela Qualidade, segregação de divergências, emissão de SEMINF / NF complementar, protocolo e entrega de NFs à Controladoria no dia subsequente e Passe de Saída (FRM.ALM-0010).
   - *Jogo:* O que fazer com este material?
   - *Insígnia:* Olho Clínico.

5. **Missão 05 · Devolução ou Recusa de Materiais**
   - *Foco:* Motivos para desfazer o fornecimento, aprovação obrigatória do Coordenador de Logística e Almoxarifado, negociação e frete reverso por Suprimentos, recusa no ato (anotação no verso da 1ª via da NF) vs devolução posterior (NF de devolução pós-MIGO).
   - *Jogo:* Qual é a modalidade de devolução?
   - *Insígnia:* Filtro Rígido.

6. **Missão 06 · Lógica de Armazenagem e Endereçamento**
   - *Foco:* Layout inteligente (itens idênticos juntos, alto consumo perto do atendente, estruturais perto da pré-montagem), consulta de vagas no SAP ZL0024, padrão DEPÓSITO . BLOCO . ANDAR . APARTAMENTO, método FIFO, químicos (FRM.ALM-0023) e gestão de materiais de terceiros (ZL0024 centro TE2T, sem endereço físico).
   - *Simulador:* `ender` (Seletor tridimensional de Depósito, Bloco/Coluna, Andar/Prateleira e Apartamento).
   - *Jogo:* Onde e como armazenar?
   - *Insígnia:* Mestre do Endereço.

7. **Missão 07 · Atendimento de Solicitação Interna**
   - *Foco:* O ciclo da Requisição de Materiais (FRM.ALM-0014) em 7 etapas: solicitação no balcão com código SAP e descrição, separação no estoque, entrega, conferência conjunta (solicitante + atendente), assinatura de recebimento, baixa no SAP e distinção de Compra Direta x Estoque.
   - *Jogo:* As 7 etapas do atendimento no balcão (ordenação).
   - *Insígnia:* Balcão Ágil.

8. **Missão 08 · Avarias Internas e Gestão de Terceiros**
   - *Foco:* Tratativa de danos internos (identificar NC, documentar ação, segregar e repor), descarte adequado para itens de fabricação interna TEN, preservação de materiais de terceiros (centro TE2T) e notificação formal de ocorrências ao cliente externo.
   - *Jogo:* Tratativa correta da ocorrência.
   - *Insígnia:* Sentinela do Patrimônio.

9. **Missão 09 · Inventário Periódico de Estoque**
   - *Foco:* Inventário anual com efeito fiscal, criação no SAP (MI01), impressão de lista (MI21), digitação da 1ª contagem (MI04), lista de diferenças (MI20), 2ª contagem com equipe diferente (MI05), regra de desempate da 3ª contagem, as 4 assinaturas e carimbos no relatório (Coord. Logística, Ger. Suprimentos, Ger. Financeiro, Diretor da Fábrica TEN) e ação Registrar Diferença na MI20.
   - *Jogo:* A sequência oficial do Inventário Periódico no SAP (ordenação).
   - *Insígnia:* Acuracidade 100%.

10. **Missão 10 · Desafio Final do Almoxarifado**
    - *Foco:* Revisão dos 5 pilares, rodada mista com 10 casos operacionais críticos e quiz contra o relógio de 8 perguntas em 15 segundos.
    - *Insígnia:* Mestre do Almoxarifado.

---

## Inconsistências Identificadas no PDF do PO

1. **Referência de Item Incorreta:** Na pág. 7, o texto orienta *"Deverá ser realizado o endereçamento do material no estoque (vide item 4.5)"*, porém a seção de Lógica de Armazenagem e Endereçamento é na realidade o **item 5.5** (o item 4 trata apenas de Responsabilidades).
2. **Duplicidade / Conflito na Responsabilidade de Lançamento no SAP:** Na pág. 4 consta como responsabilidade do Almoxarifado *"Registrar os materiais pertencentes à TEN em sistema SAP, conforme Pedido de Compras ou NF"*. Já na pág. 6, o texto esclarece categoricamente que *"O registro das entradas em Sistema SAP é realizado pelo setor da Controladoria. Desta forma, o Almoxarifado deve protocolar todas as Notas Fiscais recebidas durante o dia de trabalho e no dia subsequente entregá-los ao referido Setor para lançamento, arquivamento e provisão de pagamento"*. A trilha seguiu a regra prática da pág. 6.
3. **Materiais de Terceiros:** Fica expressamente vedado o endereçamento físico de peças de clientes no galpão geral (elas são apenas identificadas fisicamente e controladas sistemicamente no centro TE2T via ZL0024).
