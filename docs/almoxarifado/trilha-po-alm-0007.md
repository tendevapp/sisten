# Trilha Gamificada · PO.ALM-0007 (Controle de Processos, Produtos e Serviços Providos Externamente)

- **Código:** PO.ALM-0007
- **Revisão:** 00 (03/11/2022)
- **Emissor:** Ana Paula De Araujo Nascimento
- **Aprovador:** Fabio da Silva Muricy
- **Arquivos:**
  - Standalone: `.agents/skills/trilha-gamificada-po/assets/motor/trilha-po-alm-0007-standalone.html`
  - Incorporação SISTEN: `public/treinamentos/trilha-po-alm-0007.html`
  - Definição das Missões: `.agents/skills/trilha-gamificada-po/assets/motor/missions-alm0007.js`
- **Total de Missões:** 9 missões (34 cenas, 9 jogos, 40 perguntas de quiz, 1 simulador interativo de alçadas e governança de pedidos).
- **Duração Estimada:** ~45 minutos.
- **Padrão de Layout:** Full-bleed preenchendo a tela inteira (`FIT = true` com escala proporcional dinâmica em `#fitbox > #fit`, sem margens vazias e totalmente responsivo no desktop e mobile).

---

## Inconsistências e Particularidades Mapeadas no PDF (PO.ALM-0007, Rev. 00)

1. **Referência a Anexo 4 Inexistente no Documento:**
   - *No PDF (item 3, pág. 3):* O texto estabelece: *"As responsabilidades das áreas envolvidas estão no anexo 4 deste procedimento"*.
   - *No Sumário e nas Páginas 6 a 9:* O documento contém apenas 3 anexos:
     - Anexo 1: Fluxograma de Processo - Aquisição (pág. 7);
     - Anexo 2: Fluxograma de Processo MPP (pág. 8);
     - Anexo 3: Responsabilidades e autoridades para avaliação e qualificação dos fornecedores (pág. 9).
   - *Na Trilha:* A matriz de responsabilidades foi devidamente associada ao **Anexo 3** oficial.

2. **Citação Errada de Anexo no Item 6.2:**
   - *No PDF (item 6.2, pág. 4):* O texto afirma que *"Uma lista dos fornecedores qualificados está disponível no sistema para a seleção – anexo 2"*.
   - *No Anexo 2 (pág. 8):* O Anexo 2 corresponde exclusivamente ao *"Fluxograma de Processo MPP – Plano de Processos de Manufatura"*. A lista oficial de fornecedores qualificados é mantida no sistema SAP / Portal AG.
   - *Na Trilha:* Esclarecido que a lista de qualificados reside na base sistêmica e na rede corporativa da TEN.

3. **Caminhos de Pastas de Rede no Rodapé:**
   - *No PDF (páginas 7, 8 e 9):* Todos os anexos exibem no rodapé o caminho local de rede: `G:\Suprimentos\28 - Processamento de Faturas\Elaboração de Procedimentos\ABNT NBR - ISO 9001 2015`.
   - *Na Trilha:* Destacada a importância da retenção digital formalizada no sistema da TEN e a transição para plataformas integradas.

4. **Procedimento Multidisciplinar sob Sigla de Almoxarifado:**
   - *No Documento:* Embora registrado com a sigla `PO.ALM-0007`, o procedimento cobre toda a esteira de aquisições da TEN (Qualidade, Engenharia, Planejamento, Diligenciamento e Suprimentos).
   - *Na Trilha:* Valorizado o elo de ouro entre todas as áreas, posicionando o Almoxarifado como o guardião da doca que realiza a conferência física, atesta as notas fiscais e alimenta o ciclo de avaliação de desempenho dos fornecedores.

---

## Estrutura das 9 Missões

1. **Missão 01 · Por que Controlar Provedores? A Qualidade Externa**
   - *Foco:* Propósito e escopo do PO.ALM-0007 (Itens 1 e 2); por que os insumos de fornecedores externos determinam a segurança das torres eólicas de 120m; itens críticos (chapas, flanges, door frames, consumíveis e internos); definição de desempenho (Item 4.2: qualidade técnica e pontualidade no prazo).
   - *Jogo:* Critérios Fundamentais de Fornecimento (`deck`).
   - *Insígnia:* Guardião da Cadeia de Valor.

2. **Missão 02 · Qualificação & Seleção: Os 4 Critérios de Entrada**
   - *Foco:* Os 4 critérios formais de qualificação (Item 6.1: ISO 9001:2015, Homologação AG, Auditoria TEN, Experiência aceita pela TEN); obrigatoriedade da **Análise de Risco prévia conjunta** (Qualidade + Engenharia + Suprimentos); proibição categórica de contratação de fornecedores não qualificados (Anexo 1).
   - *Jogo:* Fornecedor Apto vs Não Qualificado (`deck`).
   - *Insígnia:* Inspetor de Qualificação.

3. **Missão 03 · O MPP: Plano de Processos de Manufatura**
   - *Foco:* Definição de MPP (Item 4.3); o fluxo de elaboração pelo fornecedor e envio a Suprimentos (Anexo 2); análise de risco técnica conduzida pela Engenharia e Qualidade; fluxo de reprovação (comentários de correção) versus fluxo de aprovação formal (autorização para início da fabricação do pedido).
   - *Jogo:* O Fluxo de Aprovação do MPP (`order`).
   - *Insígnia:* Especialista em MPP.

4. **Missão 04 · Requisição de Materiais (RM) & Diligenciamento**
   - *Foco:* Geração da RM via SAP (Item 6.4); instruções de subcontratações e desenhos técnicos anexados pela Engenharia; planejamento de cronogramas de insumos e prazos de entrega; atuação do Diligenciamento alimentando o SAP e prevenindo atrasos na fábrica.
   - *Jogo:* Da Engenharia ao Diligenciamento (`order`).
   - *Insígnia:* Controlador de Diligenciamento.

5. **Missão 05 · Alçadas de Aprovação & Governança de Pedidos**
   - *Foco:* A análise crítica mandatória prévia (Item 6.6); tabelas e tetos de alçada para **Materiais** (N1 até 10k: Gerentes; N2 até 300k: Diretor Obra; N3 até 600k: Sup. Comercial; N4 > 600k: Presidente) e para **Serviços** (N1 até 10k: Gerente Adm/Fin; N2 até 1M: Gerente Unidade; N3 até 3M: Superintendente; N4 até 6M: Diretores; N5 > 6M: Presidente).
   - *Simulador Interativo:* `provedores` (Simulador interativo de alçadas por tipo de aquisição e faixa de valor em milhares de reais).
   - *Jogo:* Alçadas e Níveis de Aprovação (`deck`).
   - *Insígnia:* Gestor de Alçadas.

6. **Missão 06 · Informações ao Fornecedor: Requisitos no Pedido**
   - *Foco:* As 7 cláusulas e dados mandatórios no Pedido de Compra (Item 6.7: especificações técnicas, desenhos anexados, condições gerais, cronograma de entrega, obrigatoriedade de envio do MPP aprovado antes da fabricação, plano de inspeções nas instalações do fornecedor e datas agendadas de auditoria).
   - *Jogo:* Requisitos Mandatórios no Pedido de Compras (`deck`).
   - *Insígnia:* Auditor de Contratação.

7. **Missão 07 · Recepção no Almoxarifado & Inspeção de Entrada**
   - *Foco:* A esteira de recebimento na fábrica (Anexo 1); conferência física e dimensional pelo Almoxarifado; confronto contra DANFE, pedido de compra e certificados da qualidade; direcionamento para lançamento fiscal/pagamento; entrega formal à Área Solicitante e encaminhamento a Suprimentos para avaliação de desempenho.
   - *Jogo:* O Fluxo de Recebimento no Almoxarifado (`order`).
   - *Insígnia:* Guardião do Recebimento.

8. **Missão 08 · Avaliação Anual & Matriz de Responsabilidades**
   - *Foco:* Monitoramento contínuo através de questionário estruturado no **portal AG** (Item 6.3); periodicidade mandatória de **reavaliação anual**; Matriz RACI (Anexo 3) delimitando quem é responsável, quem participa e quem aprova; as 9 informações documentadas mantidas na rede TEN (Item 6.5).
   - *Jogo:* Gestão de Fornecedores e Avaliação Contínua (`deck`).
   - *Insígnia:* Gestor de Performance.

9. **Missão 09 · Desafio Final dos Provedores Externos**
   - *Foco:* Síntese sistêmica de todo o PO.ALM-0007; rodada mista de decisão rápida de 8 cartas (`deck`); quiz final cronometrado com 15 segundos por pergunta (`qtime: 15`).
   - *Jogo:* Rodada Mista de Provedores Externos (`deck`).
   - *Insígnia:* Especialista em Controle de Provedores TEN (Certificado Liberado).

---

## Integração no SISTEN

- Cadastrada na tabela `trein_trilhas` (Supabase `supabase-sisten`):
  - `id`: `f39b1a07-a42e-4cb2-8113-750000000007`
  - `setor_id`: `'2'` (Almoxarifado)
  - `codigo`: `PO.ALM-0007`
  - `titulo`: `Controle de Processos, Produtos e Serviços Providos Externamente`
  - `ordem`: `5`
  - `arquivo_path`: `treinamentos/trilha-po-alm-0007.html`
  - `ativo`: `true`
- Links e Rotas:
  - Hub de Treinamentos do Almoxarifado: `/treinamentos/setor?setor=2`
  - Execução da Trilha: `/treinamentos/trilha?id=f39b1a07-a42e-4cb2-8113-750000000007`
  - Atalho no Hub Operacional do Almoxarifado ([`RecebimentoAlmox.tsx`](file:///c:/Users/andre.araujo/OneDrive%20-%20Andrade%20Gutierrez/DEV/TEN/SISTEN/sisten/src/views/almoxarifado/RecebimentoAlmox.tsx)).
