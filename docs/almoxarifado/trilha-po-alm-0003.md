# Trilha Gamificada · PO.ALM-0003 (Preservação de Materiais)

- **Código:** PO.ALM-0003
- **Revisão:** 03 (04/06/2026)
- **Emissor:** Jamille da Silva Batista
- **Aprovador:** Gilmara Moura de Souza
- **Arquivos:**
  - Standalone: `.agents/skills/trilha-gamificada-po/assets/motor/trilha-po-alm-0003-standalone.html`
  - Incorporação SISTEN: `public/treinamentos/trilha-po-alm-0003.html`
  - Definição das Missões: `.agents/skills/trilha-gamificada-po/assets/motor/missions-alm0003.js`
- **Total de Missões:** 9 missões (35 cenas, 9 jogos, 40 perguntas de quiz, 2 simuladores interativos).
- **Duração Estimada:** ~45 minutos.
- **Padrão de Layout:** Full-bleed fluido no iframe do SISTEN (idêntico ao padrão das trilhas de Suprimentos PO.SUP-0004 e PO.SUP-0010, preenchendo a tela inteira sem fitbox / escalas artificiais).

---

## Inconsistências Mapeadas no PDF (PO.ALM-0003, Rev. 03)

1. **Título na Capa vs Cabeçalho das Páginas:**
   - *No PDF (pág. 1):* "Preservação de Materiais de Materiais" (duplicação da palavra "Materiais").
   - *No cabeçalho das páginas 2 a 6:* "Preservação de Materiais".
   - *Na Trilha:* Adotado o título oficial e correto **"Preservação de Materiais"**.

2. **Citação de Formulário de Validade:**
   - *No item 6.2:* "FRM 0023 - Controle de Validade dos Produtos" (sem o prefixo de módulo).
   - *No item 6.3:* "FRM.ALM-0023 – Controle de Validade de Produtos".
   - *Na Trilha:* Adotado o código completo e padronizado **FRM.ALM-0023**.

3. **Citação de Formulário de Propriedade de Terceiros:**
   - *No item 6.4:* O procedimento do Almoxarifado cita o formulário sob o prefixo de Suprimentos: **FRM.SUP-0001 – Propriedades Pertencentes a Clientes ou Provedores Externos**.
   - *Na Trilha:* Mantido fielmente o código citado no documento oficial (**FRM.SUP-0001**).

4. **Procedimento de Consumíveis de Soldagem:**
   - *No item 6.2:* Cita o procedimento da Engenharia **PO.ENG-0001 – Recebimento e Condicionamento de Consumíveis de Soldagem**.
   - *Na Trilha:* Reforçada a integração obrigatória entre o Almoxarifado e a Engenharia de Solda para a guarda e estufas térmicas de fluxos e arames.

---

## Estrutura das 9 Missões

1. **Missão 01 · Por que Preservar? O Guardião da Torre**
   - *Foco:* O propósito do PO.ALM-0003 para assegurar a integridade das seções da torre eólica (120m de altura); escopo completo (preservação, armazenagem, manuseio, controle de contaminação, embalagem, transporte e salvaguarda); responsabilidades compartilhadas entre Almoxarifado e Área Solicitante.
   - *Jogo:* Ciclo de Preservação (`order`).
   - *Insígnia:* Guardião da Torre.

2. **Missão 02 · Controle de Contaminação**
   - *Foco:* Riscos críticos de contaminação (Item 4.2): tintas industriais, granalhas de jateamento, fluxos e oxidação de arames de solda; criticidade de embalagens (Item 4.3); identificação obrigatória e inviolável do produto (Item 4.4).
   - *Jogo:* Separando Riscos e Agentes (`deck`).
   - *Insígnia:* Escudo Anti-Contaminação.

3. **Missão 03 · Químicos, Validade & Soldagem**
   - *Foco:* Controle formal de data de vencimento de tintas industriais via FRM.ALM-0023; requisitos de recebimento e estufas térmicas para consumíveis de soldagem (PO.ENG-0001); monitoramento periódico de validade (Item 4.9); centralização de formulários vigentes no SoftExpert (Item 6.5).
   - *Jogo:* Regras de Tintas e Solda (`deck`).
   - *Insígnia:* Inspetor Químico.

4. **Missão 04 · A Regra de Ouro: FIFO & FEFO**
   - *Foco:* Obrigatoriedade de aplicação de rotatividade (Item 5); FIFO (First In, First Out) para peças e insumos sem expiração química; FEFO (First Expired, First Out) para tintas e produtos químicos perecíveis.
   - *Simulador Interativo:* `fefo` (Demonstração prática de consumo onde o lote que vence primeiro é despachado antes, mesmo tendo chegado depois).
   - *Jogo:* Despachando pelo Giro Certo (`order`).
   - *Insígnia:* Mestre do Giro.

5. **Missão 05 · Acondicionamento & Manuseio**
   - *Foco:* Cuidados específicos de manuseio contra danos e choques mecânicos (Item 6.1); preservação de embalagens evitando danos por empilhamento inadequado (Item 5); uso de equipamentos adequados e certificados (pontes com cintas protegidas e empilhadeiras); amarração no transporte interno (Item 4.8).
   - *Jogo:* Boas Práticas de Movimentação (`deck`).
   - *Insígnia:* Mestre da Movimentação.

6. **Missão 06 · Rondas 5S & Estrutura Física**
   - *Foco:* Rotinas de limpeza e 5S nas áreas de armazenagem; inspeção periódica da estrutura predial contra infiltrações, goteiras e pragas (Item 5); organização por endereçamento logístico padrão; inventários preventivos para acuracidade e conservação do estoque.
   - *Jogo:* Ronda de Inspeção no Almoxarifado (`deck`).
   - *Insígnia:* Vigilante do 5S.

7. **Missão 07 · Incidentes Internos & Segregação**
   - *Foco:* Tratativa de materiais danificados internamente por manuseio ou preservação inadequada (Item 6.3); o fluxo de 5 passos obrigatórios: 1) Identificar a NC (descrever ocorrido); 2) Documentar a ação; 3) Segregar na área específica do Almoxarifado (quarentena); 4) Devolver ao fornecedor ou descarte adequado se fabricação interna; 5) Repor quantidade.
   - *Simulador Interativo:* `segreg` (Direcionamento de fluxos de segregação por tipo de ocorrência).
   - *Jogo:* O Fluxo dos 5 Passos de Dano (`order`).
   - *Insígnia:* Mestre da Quarentena.

8. **Missão 08 · Propriedades de Clientes & Terceiros**
   - *Foco:* Salvaguarda de patrimônio pertencente a clientes ou provedores externos (Item 4.7 e 6.4); aplicação do FRM.SUP-0001; fluxo em caso de avaria ou perda (identificar NC, documentar, segregar no almoxarifado, remeter ocorrência ao cliente externo e reter informação documentada).
   - *Jogo:* Tratamento de Propriedade Externa (`deck`).
   - *Insígnia:* Salvaguarda de Terceiros.

9. **Missão 09 · Desafio Final da Preservação**
   - *Foco:* Síntese sistêmica de todos os pontos do PO.ALM-0003; rodada mista de decisão rápida de 8 cartas; quiz final cronometrado com 15 segundos por pergunta (`qtime: 15`).
   - *Jogo:* Rodada Mista de Preservação (`deck`).
   - *Insígnia:* Mestre da Preservação TEN (Certificado Liberado).

---

## Integração no SISTEN

- Cadastrada na tabela `trein_trilhas`:
  - `id`: `d14f49b2-a42e-4cb2-8113-750000000003`
  - `setor_id`: `'2'` (Almoxarifado)
  - `ordem`: `2` (logo após a trilha PO.ALM-0001)
  - `arquivo_path`: `treinamentos/trilha-po-alm-0003.html`
- Acesso direto via rotas:
  - `/treinamentos/setor?setor=2` (Hub do Almoxarifado em Treinamentos)
  - `/treinamentos/trilha?id=d14f49b2-a42e-4cb2-8113-750000000003` (Execução direta da trilha)
