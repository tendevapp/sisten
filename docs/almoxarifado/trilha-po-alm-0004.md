# Trilha Gamificada · PO.ALM-0004 (Mobilização e Desmobilização de Equipamento de Terceiros)

- **Código:** PO.ALM-0004
- **Revisão:** 01 (01/11/2022)
- **Emissor:** Ana Paula De Araujo Nascimento
- **Aprovador:** Fabio da Silva Muricy
- **Arquivos:**
  - Standalone: `.agents/skills/trilha-gamificada-po/assets/motor/trilha-po-alm-0004-standalone.html`
  - Incorporação SISTEN: `public/treinamentos/trilha-po-alm-0004.html`
  - Definição das Missões: `.agents/skills/trilha-gamificada-po/assets/motor/missions-alm0004.js`
- **Total de Missões:** 9 missões (34 cenas, 9 jogos, 40 perguntas de quiz, 1 simulador interativo de ciclo de vida).
- **Duração Estimada:** ~45 minutos.
- **Padrão de Layout:** Full-bleed preenchendo a tela inteira (`FIT = true` com escala proporcional dinâmica em `#fitbox > #fit`, sem margens vazias e totalmente responsivo no desktop e mobile).

---

## Inconsistências e Particularidades Mapeadas no PDF (PO.ALM-0004, Rev. 01)

1. **Sumário com Itens 8 e 9 Duplicados:**
   - *No PDF (pág. 2 e 6):* O sumário lista "8. Anexo" e "9. Anexos". Na página 6, o item 8 consta como "N/A" e o item 9 traz o "Anexo 1 – Fluxograma de Processo".
   - *Na Trilha:* O fluxo do Anexo 1 foi integrado pedagogicamente entre as missões da esteira (Mobilização, Operação e Desmobilização).

2. **Terminologia "Cliente Externo" vs Provedor / Locador:**
   - *No PDF (itens 3.a, 4.5 e 6.1):* O texto refere-se frequentemente ao equipamento como "pertencente ao cliente externo", embora todo o escopo do PO trate de equipamentos alugados de fornecedores/terceiros para suportar a fabricação das torres eólicas (ex: guindastes, plataformas elevatórias, compressores, muncks).
   - *Na Trilha:* Esclarecido que se aplica a qualquer bem de propriedade de terceiros sob custódia temporária na fábrica da TEN.

3. **Depósito SAP 0070 & Transação MIGO:**
   - *No PDF (item 3.g):* Dar entrada na NF de Remessa inserindo o equipamento no SAP via MIGO no depósito **`0070` (Depósito de Terceiros)**.
   - *Na Trilha:* Enfatizada a importância do depósito 0070 para garantir a custódia e rastreabilidade contábil sem registrar falsamente o maquinário no ativo permanente da TEN.

4. **Tríplice Responsabilidade (Almoxarifado x Solicitante x Suprimentos):**
   - *Almoxarifado:* Recebe, confere NF de remessa, vistoria com check list / fotos, etiqueta, cadastra no SAP (0070), arquiva dossiê físico/digital e recebe de volta no fim do contrato.
   - *Setor Solicitante:* Opera, protege contra danos, aciona manutenções corretivas com fotos e solicita a SEMINFE para devolução.
   - *Suprimentos (Contratante):* Contrata frete de desmobilização, agenda manutenções preventivas e corretivas com a locadora e intermedeia tratativas em caso de sinistro.

5. **Documento SEMINFE (Sem Nota Fiscal Eletrônica):**
   - *No PDF (itens 3.h e 4):* Uso obrigatório da SEMINFE emitida internamente para que a Contabilidade TEN emita a competente Nota Fiscal de Devolução/Remessa.

---

## Estrutura das 9 Missões

1. **Missão 01 · Por que Mobilizar? Suporte à Operação TEN**
   - *Foco:* Propósito e escopo do PO.ALM-0004 (Item 1 e 2); por que a TEN aluga guindastes, muncks e geradores; distinção de papéis entre Almoxarifado, Solicitante e Suprimentos; integridade física do maquinário.
   - *Jogo:* As 3 Pontas da Mobilização (`deck`).
   - *Insígnia:* Guardião de Terceiros.

2. **Missão 02 · Chegada & NF de Remessa**
   - *Foco:* Recepção física no pátio (Item 3.a e 3.b); conferência rigorosa do documento de transporte (NF de remessa para locação/demonstração); dados do emitente, chassi/número de série e dados da TEN.
   - *Jogo:* Triagem da NF de Remessa (`deck`).
   - *Insígnia:* Inspetor Fiscal.

3. **Missão 03 · Check List & Vistoria Detalhada**
   - *Foco:* Inspeção de recebimento (Item 3.d e 4.4); preenchimento dos FRM's específicos de cada tipo de equipamento; registro fotográfico obrigatório de avarias pré-existentes, amassados, vazamentos e horas de horímetro antes da liberação.
   - *Jogo:* Passos do Check List de Recepção (`order`).
   - *Insígnia:* Olho Clínico de Vistoria.

4. **Missão 04 · Etiqueta de Rastreabilidade & Dossiê**
   - *Foco:* Colagem da etiqueta de identificação e rastreabilidade (Item 3.e e 6.2); composição do dossiê documental da operação (Item 3.i); centralização de formulários e procedimentos no SoftExpert (Item 6.3).
   - *Jogo:* Componentes do Dossiê do Equipamento (`deck`).
   - *Insígnia:* Mestre da Rastreabilidade.

5. **Missão 05 · Entrada no SAP: MIGO Depósito 0070**
   - *Foco:* Lançamento contábil e de estoque no SAP (Item 3.g); utilização da transação `MIGO`; apontamento estrito no depósito de terceiros **`0070`**; liberação formal para entrega ao setor solicitante.
   - *Jogo:* Lançando no SAP MIGO 0070 (`order`).
   - *Insígnia:* Operador SAP 0070.

6. **Missão 06 · Operação, Manutenção & Ciclo de Vida**
   - *Foco:* Dever de guarda e zelo do setor solicitante (Item 3 Solicitante); cronograma de manutenções preventivas monitorado por Suprimentos (Item 3 Suprimentos); manutenções corretivas em campo.
   - *Simulador Interativo:* `terceiros` (Simulador de ciclo de vida completo: Mobilização -> Operação com manutenção -> Desmobilização).
   - *Jogo:* Ciclo de Vida em Operação (`order`).
   - *Insígnia:* Guardião da Operação.

7. **Missão 07 · Incidentes, Danos & FRM.SUP-0001**
   - *Foco:* Tratativa de danos e avarias durante o uso (Item 6.1); os 5 passos obrigatórios: 1) Identificar a NC (descrever ocorrido); 2) Registrar com fotos imediatas; 3) Acionar Suprimentos/Contratante; 4) Segregar no Almoxarifado; 5) Notificar o proprietário externo retendo documentação com o FRM.SUP-0001.
   - *Jogo:* Fluxo de Incidentes e Danos (`order`).
   - *Insígnia:* Mestre da Quarentena & Sinistros.

8. **Missão 08 · Fim de Contrato & Desmobilização**
   - *Foco:* Término de vigência contratual (Item 3.h e 4.3); devolução física ao Almoxarifado; emissão de SEMINFE; solicitação de NF de Retorno à Contabilidade; contratação de frete por Suprimentos e arquivamento definitivo do dossiê (Item 3.j).
   - *Jogo:* Etapas da Desmobilização Completa (`order`).
   - *Insígnia:* Mestre da Desmobilização.

9. **Missão 09 · Desafio Final da Mobilização**
   - *Foco:* Avaliação conclusiva e sistêmica de todo o processo de terceiros; rodada mista de decisão rápida de 8 cartas (`deck`); quiz final cronometrado com 15 segundos por pergunta (`qtime: 15`).
   - *Jogo:* Rodada Mista de Terceiros (`deck`).
   - *Insígnia:* Especialista em Equipamentos de Terceiros TEN (Certificado Liberado).

---

## Integração no SISTEN

- Cadastrada na tabela `trein_trilhas` (Supabase `supabase-sisten`):
  - `id`: `f39b1a04-a42e-4cb2-8113-750000000004`
  - `setor_id`: `'2'` (Almoxarifado)
  - `codigo`: `PO.ALM-0004`
  - `titulo`: `Mobilização e Desmobilização de Equipamentos de Terceiros`
  - `ordem`: `3`
  - `arquivo_path`: `treinamentos/trilha-po-alm-0004.html`
  - `ativo`: `true`
- Links e Rotas:
  - Hub de Treinamentos do Almoxarifado: `/treinamentos/setor?setor=2`
  - Execução da Trilha: `/treinamentos/trilha?id=f39b1a04-a42e-4cb2-8113-750000000004`
  - Atalho no Hub Operacional do Almoxarifado (`src/views/almoxarifado/RecebimentoAlmox.tsx`).
