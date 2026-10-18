# Trilha Gamificada · PO.ALM-0006 (Procedimento Operacional e Sistêmico Chapas)

- **Código:** PO.ALM-0006
- **Revisão:** 00 (31/10/2022)
- **Emissor:** Ana Paula De Araujo Nascimento
- **Aprovador:** Fabio da Silva Muricy
- **Arquivos:**
  - Standalone: `.agents/skills/trilha-gamificada-po/assets/motor/trilha-po-alm-0006-standalone.html`
  - Incorporação SISTEN: `public/treinamentos/trilha-po-alm-0006.html`
  - Definição das Missões: `.agents/skills/trilha-gamificada-po/assets/motor/missions-alm0006.js`
- **Total de Missões:** 9 missões (34 cenas, 9 jogos, 40 perguntas de quiz, 1 simulador interativo de triagem de chapas e pátios).
- **Duração Estimada:** ~45 minutos.
- **Padrão de Layout:** Full-bleed preenchendo a tela inteira (`FIT = true` com escala proporcional dinâmica em `#fitbox > #fit`, sem margens vazias e totalmente responsivo no desktop e mobile).

---

## Inconsistências e Particularidades Mapeadas no PDF (PO.ALM-0006, Rev. 00)

1. **Referência a "Anexo 5" sem Correspondência no Sumário:**
   - *No PDF (item 4, pág. 4):* O texto instrui "Ver ilustrações em anexo 5". No entanto, o sumário (pág. 2) lista apenas "5. Anexos" e a página 4 traz o "Fluxograma de Processo" (rotulado no gráfico como "Anexo 1"). As ilustrações das planilhas e as fotografias dos pátios estão nas páginas 5 e 6 sem numeração formal de anexo.
   - *Na Trilha:* Todas as ilustrações, planilhas de projetos (Seridó, Assuruá, Gamesa) e fotos reais dos pátios foram integradas didaticamente ao longo das 9 missões.

2. **Legenda das Fotos vs Regra Mestra de Destinação de Pátios:**
   - *No PDF (pág. 6):* Ambas as fotos (Pátio A – Ponte e Pátio B – Pórtico) exibem a legenda idêntica *"Armazenamento: chapas de todos os projetos"*.
   - *No Texto e Fluxograma (itens 2 e 3):* A regra é explícita e categórica:
     - **Pátio A (Ponte Rolante / Pontoneiro):** Destinado a chapas de projetos que **já estão em linha de fabricação** para abastecimento contínuo de corte e calandragem;
     - **Pátio B (Pórtico Mag 75 Ton / Operador de Pórtico):** Destinado a chapas de projetos que **ainda não entraram em linha**.
   - *Na Trilha:* A regra correta e mandatória do fluxograma foi fixada como conceito central nas missões 03 e 06.

3. **Classificação Oficial do Pátio B como "Local Improvisado":**
   - *No PDF (itens 2 e 3):* O procedimento documenta formalmente o Pátio B como "local improvisado para descarregar chapas", relatando que o pátio inicial ficou deficiente de espaço diante do aumento vertiginoso de novos contratos de torres eólicas da TEN.
   - *Na Trilha:* Explicada a importância histórica e operacional da criação do Pátio B com o pórtico de grande porte (75 Toneladas) para suportar a cadência fabril sem paralisar as docas.

4. **Controle Manual em Planilhas Excel vs Gestão Sistêmica:**
   - *No PDF (item 4 e Anexo 1):* O controle das virolas e faturamento é realizado via arquivos Excel na rede local (ex: Assuruá I 33 Torres, Seridó I 36 Torres), exigindo do Apoio Operacional a conferência manual de cada virola e o arquivamento físico cronológico ascendente.
   - *Na Trilha:* Valorizada a acuracidade do Analista de Apoio Operacional e a necessidade de conferência rigorosa de pesos e tolerâncias contra o Certificado da Usina e a DANFE original.

---

## Estrutura das 9 Missões

1. **Missão 01 · Por que o Recebimento de Chapas Existe? O Coração de Aço**
   - *Foco:* Propósito e escopo do PO.ALM-0006 (Item 1 e 2); a chapa de aço como espinha dorsal da torre eólica; alinhamento quadripartite (Comercial TEN x Cliente x Fornecedor/Fabricante x Almoxarifado); responsabilidades gerais.
   - *Jogo:* O Papel do Aço na TEN (`deck`).
   - *Insígnia:* Guardião do Aço TEN.

2. **Missão 02 · Chegada na Portaria & Comunicação via Rádio**
   - *Foco:* Recepção física no portão da fábrica (Anexo 1); check-in do motorista da carreta prancha; conferência da documentação pessoal e DANFE de chapas; aviso imediato via rádio comunicador ao Almoxarifado; pesagem inicial na balança.
   - *Jogo:* Protocolo Portaria x Almoxarifado (`order`).
   - *Insígnia:* Sentinela da Portaria.

3. **Missão 03 · A Decisão dos Pátios: Pátio A ou Pátio B?**
   - *Foco:* A regra mestra de triagem; Pátio A (Galpão Principal, Ponte Rolante de 20t/30t, operador Pontoneiro, projetos em linha para alimentação contínua); Pátio B (Área externa secundária, Pórtico Mag 75 Ton, Operador de Pórtico, projetos que ainda não entraram em linha).
   - *Jogo:* Triagem de Pátios: Pátio A ou B? (`deck`).
   - *Insígnia:* Estrategista de Pátio.

4. **Missão 04 · Inspeção da Qualidade: Aprovado ou Reprovado?**
   - *Foco:* Acionamento imediato do Controle de Qualidade; inspeção física e dimensional (espessura nominal, empenamento, trincas); conferência técnica do Certificado de Matéria-Prima da usina siderúrgica; fluxo de Reprovação (abertura de RNC, isolamento e aviso por e-mail) versus fluxo de Aprovação (retenção de cópias e entrega do certificado e DANFE original ao Almoxarifado).
   - *Jogo:* Fluxo de Inspeção da Qualidade (`order`).
   - *Insígnia:* Inspetor da Qualidade.

5. **Missão 05 · Descarregamento Seguro & Operação de Carga Pesada**
   - *Foco:* Descarga física no pátio determinado; operação segura com garras magnéticas (Mag) ou acessórios homologados; empilhamento com caibros de madeira rigorosamente alinhados na vertical para evitar empenamento permanente das chapas pesadas; segregação física por projeto e virola.
   - *Jogo:* Boas Práticas de Movimentação e Estocagem (`deck`).
   - *Insígnia:* Operador de Carga Pesada.

6. **Missão 06 · Mapeamento de Tramos, Virolas & Pátio**
   - *Foco:* Engenharia estrutural da torre: Tramos (T1 a T4) e Virolas (T1V1 a T1V7, T2V1 a T2V8...); volume e escala (Seridó I com 1.731 chapas e mais de 11.000 toneladas); entrega do processo físico ao Apoio Operacional.
   - *Simulador Interativo:* `chapas` (Simulador de cenários operacionais: Em Linha -> Pátio A / Fora de Linha -> Pátio B / Inconforme -> RNC e quarentena).
   - *Jogo:* Da Chapa Bruta à Montagem dos Tramos (`order`).
   - *Insígnia:* Mestre das Virolas.

7. **Missão 07 · Controle de Faturamento & Planilhas de Projetos**
   - *Foco:* Atribuições do Analista de Apoio Operacional; gestão das planilhas dedicadas por projeto (Assuruá I, Gamesa e Seridó I); acompanhamento de saldos recebidos vs pendentes; cadência de recebimento (em 2022: média diária de 24,09 chapas e mensal de 506 chapas, somando mais de 3.540 chapas no ano).
   - *Jogo:* Gestão e Acuracidade das Planilhas de Chapas (`deck`).
   - *Insígnia:* Analista de Controles.

8. **Missão 08 · Trâmites Fiscais, Digitalização & Arquivo Dossiê**
   - *Foco:* As 4 etapas finais obrigatórias do Analista de Apoio: 1) Verificação minuciosa de toda a documentação; 2) Envio protocolado das notas fiscais originais para a Controladoria (lançamento contábil/fiscal); 3) Digitalização e renomeação padronizada na rede corporativa da TEN; 4) Armazenamento físico por data ascendente para retenção e auditorias.
   - *Jogo:* As 4 Etapas Finais do Apoio Operacional (`order`).
   - *Insígnia:* Guardião do Dossiê.

9. **Missão 09 · Desafio Final do Recebimento de Chapas**
   - *Foco:* Avaliação conclusiva e sistêmica de todo o processo de chapas; rodada mista de decisão rápida de 8 cartas (`deck`); quiz final cronometrado com 15 segundos por pergunta (`qtime: 15`).
   - *Jogo:* Rodada Mista do Aço (`deck`).
   - *Insígnia:* Especialista em Chapas TEN (Certificado Liberado).

---

## Integração no SISTEN

- Cadastrada na tabela `trein_trilhas` (Supabase `supabase-sisten`):
  - `id`: `f39b1a06-a42e-4cb2-8113-750000000006`
  - `setor_id`: `'2'` (Almoxarifado)
  - `codigo`: `PO.ALM-0006`
  - `titulo`: `Procedimento Operacional e Sistêmico Chapas`
  - `ordem`: `4`
  - `arquivo_path`: `treinamentos/trilha-po-alm-0006.html`
  - `ativo`: `true`
- Links e Rotas:
  - Hub de Treinamentos do Almoxarifado: `/treinamentos/setor?setor=2`
  - Execução da Trilha: `/treinamentos/trilha?id=f39b1a06-a42e-4cb2-8113-750000000006`
  - Atalho no Hub Operacional do Almoxarifado ([`RecebimentoAlmox.tsx`](file:///c:/Users/andre.araujo/OneDrive%20-%20Andrade%20Gutierrez/DEV/TEN/SISTEN/sisten/src/views/almoxarifado/RecebimentoAlmox.tsx)).
