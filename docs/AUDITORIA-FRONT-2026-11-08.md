# Auditoria de front — SISTEN

**Data:** 2026-11-08 · **Escopo:** interface web (`src/`, 481 `.tsx` + 554 `.ts`, ~370 mil linhas), CSS global, build de produção e service worker.
**Complementa:** [AUDITORIA-2026-08-09.md](AUDITORIA-2026-08-09.md), que cobriu segurança, banco e arquitetura.

**Como foi medido:** detector mecânico do Impeccable sobre `src/`; varredura de JSX (tags multilinha) para nome acessível, `alt` e acesso por teclado; contagem de classes Tailwind; `vite build` limpo para medir os chunks e o precache. Nada foi alterado no código.

**Não verificado:** renderização em aparelho real e leitor de tela. Os números de contraste vêm das cores do Tailwind, não de captura de tela.

---

## Andamento (atualizado em 2026-11-08)

**Fases 1 e 2 implementadas, sem commit.** Itens 1–5 e 11 da [ordem](#ordem-sugerida), mais o menu lateral, o movimento reduzido e o selo de SLA:

| Item | Onde | Verificado |
|---|---|---|
| Escuro: bloco global só onde a tela não declarou `dark:`, sem `!important`; variáveis antigas = apelidos dos tokens; `--text-muted` → `--ink-muted`; campos de todo tipo; selos pastel; painel dentro do cartão no nível 2 | [index.css](../src/index.css) | página de teste com o CSS gerado, no Chrome: 19/19 verificações; o CSS antigo falha em 11 |
| Escuro sem clarão na recarga; sem escolha salva, segue o sistema; só grava quando a pessoa troca | [index.html](../index.html), [App.tsx](../src/App.tsx) | revisão de código |
| Campos com 16px no iOS (só iOS, via `@supports (-webkit-touch-callout)`) | [index.css](../src/index.css) | não testado em iPhone |
| Modal: pilha (Esc só no do topo), foco entra, fica preso e volta, trava de rolagem do `<main>`, véu e borda mais fortes no escuro | [Modal.tsx](../src/components/ui/Modal.tsx) | Modal real empacotado com React, no Chrome: 9/9 |
| Precache 12,98 MB → **9,98 MB** (cena 3D, AdminPanel, pdf.js e `xlsx.min` sob demanda) | [vite.config.ts](../vite.config.ts) | build; conferido que nenhum formulário os importa estaticamente |
| Roda do mouse não altera mais campo numérico | [protecaoCampoNumerico.ts](../src/lib/protecaoCampoNumerico.ts) | revisão de código |
| Título da aba por rota | [pages.ts](../src/lib/pages.ts) `tituloAba` | 2 testes novos |
| Menu: `<nav>`, `aria-current`, "nova aba" como botão irmão, título de grupo legível | [Sidebar.tsx](../src/components/Sidebar.tsx) | revisão de código |
| Spinner gira com movimento reduzido; SLA sem `animate-bounce` | [index.css](../src/index.css), [HelpdeskSlaBadge.tsx](../src/views/helpdesk/HelpdeskSlaBadge.tsx) | revisão de código |

`vitest`: 2.709 testes passando. `tsc`: os mesmos 130 erros pré-existentes, nenhum novo.

**Antes de subir:** percorrer no escuro Início, Compras, Central de Compras, Portaria, Balcão, Inventário e Contas a Pagar. Cerca de 7.700 classes `dark:` que nunca tinham aparecido passam a valer, e alguma pode estar errada.

**Falta (Fase 3, varreduras por tela):** `text-slate-400` → `500` no claro, piso de fonte, `aria-label` nos botões só-ícone, ações visíveis no toque, componente `<Campo>`, alvos de toque, xlsx 0.20.3, migração dos modais à mão e dos `confirm()`, P3.

---

## Placar

| # | Dimensão | Nota | Principal achado |
|---|---|---|---|
| 1 | Acessibilidade | 2 | 1.505 textos em `slate-400` no tema claro (contraste 2,6:1); o modal não prende nem devolve o foco |
| 2 | Desempenho | 2 | O service worker baixa 13 MB na instalação; há duas bibliotecas de planilha no build |
| 3 | Tema | 1 | O bloco global do escuro anula ~7.700 classes `dark:` escritas nas telas; o modal some contra o cartão |
| 4 | Responsivo | 2 | Campos com fonte abaixo de 16px dão zoom no iPhone; botões de ~28px; ações que só aparecem no hover |
| 5 | Integridade | 3 | O sistema é coerente; os desvios estão em 24 modais feitos à mão e em 16 `confirm()` nativos |
| **Total** | | **10/20** | **Aceitável: os problemas são sistêmicos e cada um se resolve num ponto central** |

> **Revisão do mesmo dia:** a seção [Tema escuro](#tema-escuro) e os [Achados complementares](#achados-complementares) foram acrescentados depois da primeira versão. A nota de Tema caiu de 2 para 1 com o que eles mostraram.

**Veredito de integridade: passa.** A base tem identidade própria: tokens com paleta de gráfico validada nos dois temas, um modal único que vira gaveta no celular e uma regra central que converte tabela em cartões. O detector achou só 47 itens em 1.035 arquivos, quase todos decorativos. Os problemas graves estão na base (contraste, fonte mínima, foco), não em telas isoladas. Por isso mesmo dá para corrigir em lote.

---

## P1 — corrigir antes da próxima rodada de entregas

### [P1] Texto cinza-claro ilegível no tema claro
- **Onde:** 1.505 usos de `text-slate-400`/`text-gray-400` sem prefixo `dark:`; **552 deles em fonte de 11px ou menos**. Os que mais aparecem: rótulos de KPI, legendas de tabela, datas e "atualizado em".
- **Categoria:** Acessibilidade · **WCAG 1.4.3 (AA)**.
- **Impacto:** `#94a3b8` sobre branco dá **2,56:1**, e o mínimo é 4,5:1. No pátio, com sol na tela, esse texto some.
- **Correção:** trocar, no tema claro, `text-slate-400` → `text-slate-500` quando for texto (`#64748b`, 4,76:1, passa). Ícones decorativos podem ficar. **Não** mexa em `--color-slate-400` no `@theme`: isso mudaria também o `dark:text-slate-400`, que hoje passa no escuro.
- **Comando:** `$impeccable colorize` (varredura) e depois `$impeccable typeset`.

### [P1] Fonte miúda como padrão
- **Onde:** `text-[11px]` 1.844 · `text-[10px]` 1.485 · `text-[8px]`/`[9px]` 261. Os campeões são [AdminPanel.tsx](../src/views/AdminPanel.tsx) (123 usos ≤10px), [Compras.tsx](../src/views/Compras.tsx) (79), [BahiaSulAnalyticsPanel.tsx](../src/components/frete/BahiaSulAnalyticsPanel.tsx) (61) e [CadastrosSap.tsx](../src/views/CadastrosSap.tsx) (49).
- **Categoria:** Acessibilidade / Responsivo.
- **Impacto:** a maior parte do uso é no celular, em campo. Abaixo de 11px a leitura depende de zoom.
- **Correção:** um piso único. **11px** só para rótulo em caixa-alta de cabeçalho; **12px** (`text-xs`) para qualquer valor ou conteúdo. Primeiro passo mecânico: `text-[8px]`/`[9px]` → `text-[11px]`. O `text-[10px]` precisa de revisão caso a caso nas telas acima.
- **Comando:** `$impeccable typeset`.

### [P1] Modal: Esc fecha a pilha inteira e o foco fica solto
- **Onde:** [src/components/ui/Modal.tsx:45-52](../src/components/ui/Modal.tsx#L45-L52) (137 telas usam).
- **Categoria:** Acessibilidade · **WCAG 2.1.2, 2.4.3**.
- **Impacto:**
  1. Cada modal aberto põe um `keydown` na `window`. Num modal sobre modal (29 usos de `zIndexClassName`), **um Esc fecha os dois**, e quem estava no meio de um formulário perde o que digitou na tela de trás.
  2. O foco não vai para dentro do modal ao abrir, o Tab escapa para a página de trás, e ao fechar o foco não volta ao botão que abriu.
  3. A página de trás continua rolando (falta trava de rolagem do `body`) — no celular, arrastar a gaveta rola a lista por baixo.
- **Correção (num arquivo só):** uma pilha de modais no módulo em que só o do topo responde ao Esc; focar o primeiro campo ao montar; prender o Tab dentro do painel; devolver o foco ao `document.activeElement` guardado; `overflow: hidden` no `body` enquanto a pilha não estiver vazia. Depois, migrar os **24 arquivos com `fixed inset-0` feito à mão** (ex.: [SsmaRidDetalhesModal.tsx](../src/components/ssma/SsmaRidDetalhesModal.tsx), [ModalChecklistLiberacaoTramo.tsx](../src/components/producao/ModalChecklistLiberacaoTramo.tsx), [RastreioDetailModal.tsx](../src/components/rastreio/RastreioDetailModal.tsx)) para o `Modal`, e assim eles herdam o conserto.
- **Comando:** `$impeccable harden`.

### [P1] Zoom automático ao tocar num campo no iPhone
- **Onde:** cerca de 700 `<input>`/`<select>`/`<textarea>` com `text-xs`, `text-sm` ou `text-[10-11px]`. Não existe regra de 16px para celular no [index.css](../src/index.css).
- **Categoria:** Responsivo.
- **Impacto:** no Safari do iOS, campo com fonte abaixo de 16px dá zoom na página ao receber foco, e o layout fica deslocado até a pessoa fazer o gesto de pinça. Afeta todos os formulários de campo (Portaria, Balcão, RID, Inventário).
- **Correção:** regra global, sem tocar em telas:
  ```css
  @media (max-width: 640px) {
    input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
    select, textarea { font-size: 16px; }
  }
  ```
  Confira depois as 3–4 telas mais densas (filtros do Compras, grade do Inventário). **Não** use `maximum-scale=1` no viewport, porque isso bloqueia o zoom de quem precisa dele.
- **Comando:** `$impeccable adapt`.

### [P1] O service worker baixa 13 MB na primeira visita
- **Onde:** [vite.config.ts:48](../vite.config.ts#L48): `globPatterns: ['**/*.{js,css,svg,woff2,ico}']` faz o precache de **392 arquivos, 12,98 MB**. Isso inclui a cena 3D do Gemba (996 KB), as duas bibliotecas de planilha (849 + 419 KB), o pdf.js (528 KB) e o AdminPanel (631 KB).
- **Categoria:** Desempenho.
- **Impacto:** todo colaborador novo, ou todo aparelho depois de um deploy, baixa 13 MB em segundo plano pela rede do pátio. Isso é o egress do Supabase/Vercel e a franquia do celular. E a cada deploy os chunks mudam de nome e o download recomeça.
- **Correção:** fazer o precache só do shell e das rotas de **formulário offline** (o que o CLAUDE.md §3 exige que abra sem rede). Telas administrativas, 3D, xlsx e pdf passam a `runtimeCaching` com `CacheFirst` em `/assets/`: entram no cache na primeira vez que a pessoa abre a tela. Para isso, usar `globIgnores` com os nomes de chunk pesados e conferir com `npm run build` que a linha `precache N entries` caiu.
- **Comando:** `$impeccable optimize`.

---

## P2 — próxima passada

### [P2] Duas bibliotecas de planilha, e a vulnerável continua
- **Onde:** [package.json:41-42](../package.json#L41-L42): `xlsx@0.18.5` (56 arquivos) **e** `xlsx-js-style` (10 arquivos). O build gera `xlsx.min` (849 KB) **e** `xlsx` (419 KB).
- **Impacto:** cerca de 1,2 MB de código duplicado. E o `xlsx@0.18.5`, com *Prototype Pollution* e *ReDoS* apontados na auditoria de agosto, **ainda está lá**.
- **Correção:** trocar pela distribuição oficial `xlsx-0.20.3` (CDN do SheetJS) e, se o estilo de célula for indispensável, manter só o `xlsx-js-style` nos 10 exportadores que pintam célula. Os 64 imports estáticos já estão em chunks de rota, então o ganho é no precache e no download por tela, não no carregamento inicial.
- **Comando:** `$impeccable optimize`.

### [P2] Botões só com ícone, sem nome
- **Onde:** 218 botões cujo conteúdo é só um ícone e que não têm `aria-label`. **58 não têm nome nenhum**; os outros 160 dependem de `title`, que não aparece no toque nem é lido de forma confiável. Mais concentrados em [AdminPanel.tsx](../src/views/AdminPanel.tsx), [SsmaEpiPorFuncaoView.tsx](../src/views/ssma/SsmaEpiPorFuncaoView.tsx), [SsmaFormEditorModal.tsx](../src/components/ssma/SsmaFormEditorModal.tsx) e [CadastrosAdmin.tsx](../src/views/CadastrosAdmin.tsx).
- **WCAG:** 4.1.2.
- **Correção:** copiar o `title` para `aria-label` (mecânico nos 160) e escrever o rótulo nos 58.
- **Comando:** `$impeccable clarify`.

### [P2] Menu lateral sem semântica de navegação
- **Onde:** [src/components/Sidebar.tsx:117](../src/components/Sidebar.tsx#L117) e [Sidebar.tsx:270](../src/components/Sidebar.tsx#L270).
- **Impacto:** é um `<aside>` sem `<nav>`, e o item ativo é marcado só pela cor (`border-l-4` + verde) sem `aria-current="page"`. O ícone "Abrir em nova aba" ([Sidebar.tsx:300](../src/components/Sidebar.tsx#L300)) é um `<span onClick>` **dentro** do `<a>`: interativo dentro de interativo, inalcançável por teclado. Como o link já aceita Ctrl/⌘+clique, o atalho pode virar `<button>` irmão do link ou sair.
- **Comando:** `$impeccable harden`.

### [P2] Elementos clicáveis que o teclado não alcança
- **Onde:** 139 `div`/`span`/`tr`/`td` com `onClick` e sem `role`, `tabIndex` ou `onKeyDown`. Parte são fundos de modal (aceitável); o resto são **linhas de tabela que abrem o detalhe** e cartões clicáveis. Mais concentrados em [AdminPanel.tsx](../src/views/AdminPanel.tsx) (9), [Compras.tsx](../src/views/Compras.tsx) (6) e [HistoricoCotacoes.tsx](../src/views/HistoricoCotacoes.tsx) (5).
- **WCAG:** 2.1.1.
- **Correção:** em linha de tabela, colocar um `<button>` ou link na célula identificadora e deixar o `onClick` da linha como atalho de mouse. Em cartão, trocar a `div` por `<button>`.
- **Comando:** `$impeccable harden`.

*(O item sobre o tema escuro saiu daqui e foi para a seção própria [Tema escuro](#tema-escuro), mais abaixo.)*

### [P2] Alvos de toque pequenos
- **Onde:** 485 botões com `py-1` (~28px de altura), 90 com `p-1.5`, 45 com `p-1`.
- **Impacto:** com luva ou no celular em movimento, toca-se o botão vizinho. Em tabela densa no desktop esse tamanho é aceitável; no toque, não.
- **Correção:** regra para ponteiro grosso, sem mudar o desktop:
  ```css
  @media (pointer: coarse) { button, [role="button"], a { min-height: 40px; } }
  ```
  Teste antes nas barras de chips e paginação, que podem quebrar linha.
- **Comando:** `$impeccable adapt`.

### [P2] `confirm()` nativo em ações destrutivas
- **Onde:** 16 arquivos, por exemplo [PainelRecebimento.tsx:215](../src/components/projetos/PainelRecebimento.tsx#L215) ("Estornar a entrada…"), [LancamentoNave.tsx:99](../src/components/producao/apontamentos/LancamentoNave.tsx#L99) e [CadastroItensAlmox.tsx:629](../src/views/almoxarifado/CadastroItensAlmox.tsx#L629). Já existe [ConfirmDialog](../src/components/ui/ConfirmDialog.tsx), usado em 50 arquivos.
- **Impacto:** no PWA instalado o diálogo do sistema mostra a URL e quebra o visual. Também não deixa destacar o botão destrutivo nem explicar a consequência.
- **Comando:** `$impeccable clarify`.

---

## Tema escuro

O tema escuro tem uma base boa: os tokens de [tokens.css](../src/styles/tokens.css), com rampas próprias para o escuro e não uma simples inversão. O problema é que um bloco antigo do [index.css:110-250](../src/index.css#L110-L250) passa por cima de tudo. No CSS gerado conferi que essas regras ficam **fora de camada** (*unlayered*) e com `!important`. No Tailwind v4 os utilitários moram em `@layer utilities`, então essas regras ganham de qualquer classe `dark:` **independentemente da especificidade**.

### [P1] As classes `dark:` das telas não valem
- **Onde:** [index.css:162-200](../src/index.css#L162-L200) (`.dark .text-slate-400 { color: var(--text-muted) !important }`, `.dark .bg-white`, `.dark .border-slate-200`…).
- **Impacto:** quando uma tela escreve `text-slate-500 dark:text-slate-300`, o `dark:` é ignorado e vale o cinza do bloco global. Medido nas `className`:

  | Combinação na mesma classe | Ocorrências anuladas |
  |---|---|
  | `border-slate-100/200` + `dark:border-*` | 1.954 |
  | `text-slate-600/700` + `dark:text-*` | 1.574 |
  | `text-slate-800/900` + `dark:text-*` | 1.328 |
  | `bg-white` + `dark:bg-*` | 1.143 |
  | `text-slate-400/500` + `dark:text-*` | 1.018 |
  | `bg-slate-50` + `dark:bg-*` | 693 |

  São **cerca de 7.700** decisões de tema escuro que quem escreveu a tela tomou e que não aparecem. É por isso que o escuro parece "achatado": tudo cai em três cinzas e três fundos.
- **Correção (um arquivo, sem tocar nas telas):** fazer o bloco valer **só onde a tela não declarou `dark:`** e tirar o `!important`:
  ```css
  .dark .text-slate-500:not([class*="dark:text-"]),
  .dark .text-slate-400:not([class*="dark:text-"]) { color: var(--ink-muted); }
  .dark .bg-white:not([class*="dark:bg-"])          { background-color: var(--surface-card); }
  .dark .border-slate-200:not([class*="dark:border-"]) { border-color: var(--hairline); }
  /* …mesmo padrão para as demais regras do bloco */
  ```
  O bloco continua cobrindo as telas antigas sem `dark:`, e as que declararam passam a ser respeitadas.
- **Atenção:** cerca de 7.700 valores que nunca foram vistos vão aparecer de uma vez, e alguns podem estar errados. Antes de subir, percorra no escuro as telas mais usadas: Início, Compras, Central de Compras, Portaria, Balcão, Inventário e Contas a Pagar.
- **Comando:** `$impeccable colorize`.

### [P1] Texto secundário abaixo do contraste mínimo
- **Onde:** `--text-muted: #64748b` ([index.css:126](../src/index.css#L126)), que é para onde o bloco manda todo `text-slate-400/500` e todo placeholder.
- **Impacto:** **4,1:1** sobre a página, **3,9:1** sobre o cartão e **3,5:1** dentro de campo (`#171e30`), em boa parte com 10–11px. O token novo `--ink-muted: #94a3b8` dá **7,2:1** sobre o cartão.
- **Correção:** `--text-muted: var(--ink-muted)`. De forma geral, as variáveis antigas passam a ser apelidos dos tokens (`--bg-primary: var(--surface-page)`, `--bg-secondary: var(--surface-card)`…), e ninguém cria variável nova fora do `tokens.css`.

### [P1] A tela clara pisca a cada recarga
- **Onde:** [App.tsx:286-300](../src/App.tsx#L286-L300). A classe `.dark` só entra depois que o React monta **e** o usuário carrega (`theme === 'dark' && user`).
- **Impacto:** quem usa o escuro vê a tela branca por um instante em toda recarga, e mais tempo no pátio, onde a sessão demora a responder. À noite, na Portaria, é um clarão. Além disso, sem preferência salva, o tema ignora a do sistema (`return 'light'`).
- **Correção:**
  1. Um script inline no `<head>` do [index.html](../index.html), antes do CSS, que lê `localStorage.theme` (com `try/catch`) e aplica `.dark` quando há sessão salva do Supabase.
  2. Sem preferência salva, seguir `prefers-color-scheme`.
  3. `<meta name="color-scheme" content="light dark">`, pendente desde a auditoria de agosto.

  A tela de login pode continuar sempre clara, se for intencional.
- **Comando:** `$impeccable harden`.

### [P2] Sem degraus de elevação: o modal some contra o cartão
- **Onde:** página `#0a0e17` × cartão `#0f1422` dão **1,06:1**, praticamente a mesma cor. O [Modal](../src/components/ui/Modal.tsx#L79) usa `bg-white`, que o bloco converte para a cor do **cartão**. O véu `bg-slate-950/60` quase não escurece um fundo que já é escuro. E as quatro sombras (`shadow-sm` a `shadow-xl`) foram achatadas para um único valor ([index.css:239](../src/index.css#L239)).
- **Impacto:** um modal aberto sobre um cartão fica da mesma cor do cartão, separado só por uma borda de 1px. Painéis internos com `bg-slate-50` viram a cor da **página**: ficam mais escuros que o cartão que os contém, ou seja, parecem afundados quando deviam parecer elevados.
- **Correção:** no escuro a elevação vem da superfície mais clara, não da sombra. Proposta de escada:

  | Nível | Uso | Token |
  |---|---|---|
  | 0 | página | `--surface-page` `#0a0e17` |
  | 1 | cartão, cabeçalho | `--surface-card`, clareado para ~`#111827` |
  | 2 | painel interno, hover, campo | `--surface-raised` `#171e30` |
  | 3 | modal, popover, menu | novo `--surface-overlay` ~`#1e2740` + `--hairline-strong` |

  Painel `bg-slate-50` dentro de cartão → nível 2 (`.dark .bg-white .bg-slate-50`). Painel do modal → nível 3. Véu → `rgba(0,0,0,.7)`.
- **Comando:** `$impeccable colorize`.

### [P2] Selos e faixas pastel brilhando no escuro
- **Onde:** `bg-*-50`/`bg-*-100` sem `dark:` na mesma classe: emerald 92 · rose 83 · amber 75 · blue 31 · red 24 · indigo 22 · cyan 13. Só quatro tons pastel têm regra no bloco ([index.css:222-240](../src/index.css#L222-L240)).
- **Impacto:** cerca de 340 blocos quase brancos (status "Aprovado", "Vencido", alertas) em tela escura. São os pontos mais claros da tela, e chamam mais atenção do que o dado.
- **Correção:** a mesma regra `:not([class*="dark:bg-"])` para a família pastel, com fundo `rgba(cor, .12)`, e `text-*-700` → `text-*-300` no escuro. Os valores de status em `--status-*` são iguais nos dois temas. Para fundo e ícone servem, mas `--status-critical` como **texto** dá 3,8:1 sobre o cartão; para texto, use o passo da série (`--series-8` escuro, `#e66767`).

### [P2] Campos de hora, busca e telefone ficam claros
- **Onde:** o seletor de campos do bloco ([index.css:201-211](../src/index.css#L201-L211)) lista só `text/password/email/number/date`. Ficam de fora **26 `type="time"`** (horários da Portaria e da ASE), 5 `search`, 2 `tel`, 2 `month` e 1 `url`.
- **Correção:** `input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"])`. O `color-scheme: dark` já presente cuida do ícone do relógio e do calendário.

### [P3] Pequenos vazamentos do claro
- 54 anéis de foco translúcidos (`focus:ring-*/20` e semelhantes), e só 1 com variante `dark:`. Sobre `#171e30`, um anel verde a 20% praticamente não aparece. → um anel único `focus-visible:ring-2 ring-[--brand]` nos campos.
- 12 arquivos de gráfico com `fill`/`stroke` em hex fixo, fora das cenas e do logo, ignorando os tokens `--chart-*`. Ex.: [AcompanhamentoDashboard.tsx](../src/components/planejamento/AcompanhamentoDashboard.tsx), [RhRelatorioTreinamentos.tsx](../src/views/rh/RhRelatorioTreinamentos.tsx), [IndicadorProgressoTorre.tsx](../src/components/producao/IndicadorProgressoTorre.tsx).
- 126 `style={{ color/background: '#…' }}` fixos, que não reagem ao tema.

---

## Achados complementares

Itens que a primeira versão não cobria, voltados para quem preenche formulário no celular.

### [P2] Rótulo que não está ligado ao campo
- **Onde:** 390 campos sem `aria-label`, sem `id` ligado a um `htmlFor` e fora de um `<label>` que os envolva. Ou só têm placeholder, ou têm um `<label>` irmão solto. Mais concentrados em [NewRequest.tsx](../src/views/NewRequest.tsx) (23), [PortariaRelatorio.tsx](../src/views/portaria/PortariaRelatorio.tsx) (18), [SsmaAlcoolemiaView.tsx](../src/views/ssma/SsmaAlcoolemiaView.tsx) (11) e [PortariaAlcoolemia.tsx](../src/views/portaria/PortariaAlcoolemia.tsx) (10).
- **Impacto:** tocar no rótulo não foca o campo (no celular, o alvo útil encolhe para a caixa). Quando o placeholder é o único rótulo, ele some assim que a pessoa começa a digitar, e no meio do preenchimento ela já não sabe de qual campo se trata. O leitor de tela anuncia só "editar texto".
- **WCAG:** 1.3.1, 3.3.2.
- **Correção:** `useId()` + `htmlFor` nos formulários de campo, começando pela Portaria e pela Nova Solicitação. Um componente `<Campo rotulo erro>` evita repetir isso em cada tela.
- **Comando:** `$impeccable clarify`.

### [P2] Erro de validação que não chega ao campo
- **Onde:** há 157 campos `required`, mas só **1** `aria-invalid` e **1** `aria-describedby` no código todo.
- **Impacto:** o erro aparece como toast ou como texto vermelho solto. O campo errado não é marcado nem recebe foco, e num formulário longo a pessoa precisa caçar o problema.
- **Correção:** ao falhar, marcar `aria-invalid`, ligar a mensagem com `aria-describedby`, rolar até o primeiro campo inválido e focá-lo. Isso cabe no mesmo componente `<Campo>`.
- **Comando:** `$impeccable harden`.

### [P2] Campos numéricos: roda do mouse e vírgula
- **Onde:** **68 de 68** `<input type="number">` sem `onWheel`, e não há proteção global.
- **Impacto:**
  1. No desktop, rolar a página com o cursor sobre um campo de quantidade **focado** muda o valor em silêncio. Já aconteceu em sistema de estoque, e é o tipo de erro que só aparece no inventário.
  2. Em alguns teclados Android pt-BR, `type="number"` não aceita a vírgula, e "1,5" não entra.
- **Correção:**
  1. Um listener global: `wheel` sobre `input[type=number]:focus` → `blur()`.
  2. Para quantidade e valor, preferir `type="text" inputMode="decimal"` com o parser de vírgula que o app já usa nas importações.

  Hoje há só 60 `inputMode`, 11 `autoComplete` e 2 `enterKeyHint`. O `enterKeyHint="next"` nos formulários de campo faz o Enter do teclado ir para o próximo campo.
- **Comando:** `$impeccable adapt`.

### [P2] Ações que só aparecem com o mouse por cima
- **Onde:** 22 `opacity-0 group-hover:opacity-100`, dos quais só 4 são protegidos com `lg:`/`md:`/`sm:`. O Sidebar faz certo (`opacity-100 lg:opacity-0`); 18 casos não fazem.
- **Impacto:** no toque, o botão (editar, excluir, copiar) existe mas é invisível. A pessoa só o descobre por acidente.
- **Correção:** o mesmo padrão do Sidebar, ou `[@media(hover:hover)]:opacity-0`.
- **Comando:** `$impeccable adapt`.

### [P2] Toda aba se chama "SISTEN — Sistema de Informação"
- **Onde:** `document.title` só muda em [Slides.tsx:115](../src/components/apresentacao/Slides.tsx#L115). As rotas nunca o alteram.
- **Impacto:** o menu oferece "abrir em nova aba" e quem trabalha com cinco abas abertas não sabe qual é qual. O histórico do navegador e os favoritos ficam todos com o mesmo nome.
- **Correção:** no roteador do [App.tsx](../src/App.tsx), `document.title = \`${pagina.label} · SISTEN\`` a partir de `src/lib/pages.ts`, que já tem o rótulo de cada rota.

### [P3] Retoques
- **Feedback de toque:** há 1.594 `hover:bg-*` para 187 `active:*`. No celular não existe hover, então o botão não reage ao toque até a ação terminar. Basta um `active:` no botão base (escala 0,98 ou um tom mais escuro).
- **Carregamento:** 436 telas mostram "Carregando…" com spinner, e só 9 usam o `.skeleton` que já existe nos tokens. Quando o conteúdo chega, a tela pula. Nas listas principais, use esqueleto do mesmo tamanho do conteúdo. → `$impeccable polish`
- **Escala de camadas:** 14 níveis de `z-index` em uso, de `z-10` a `z-[200]`, com dropdowns em `z-[110]`/`z-[120]` disputando com o modal em `z-[100]`. Defina 5 nomes (conteúdo, cabeçalho, gaveta, modal, toast) no `@theme`.
- **Emoji como ícone:** 76 emojis em texto de interface, concentrados em [TabVisaoGeral.tsx](../src/components/suprimentos/TabVisaoGeral.tsx) (15), [HelpdeskSatisfactionCard.tsx](../src/components/helpdesk/HelpdeskSatisfactionCard.tsx) (11) e [Compras.tsx](../src/views/Compras.tsx) (11). Cada sistema (Windows × Android) desenha diferente, não seguem o tema e destoam do lucide usado no resto.
- **`transition-all`:** 617 usos. Ele anima também largura, altura e sombra, o que custa desempenho e produz movimentos não planejados. Na maioria dos casos `transition-colors` basta.
- **Login e página Sobre** são as únicas telas de "vitrine" (as demais são telas de trabalho). Se quiser elevar o visual delas, essa é uma passada separada com a skill `design-taste-frontend`, que não se aplica ao resto do app.

---

## P3 — se sobrar tempo

- **Movimento reduzido apaga tudo.** [index.css:985-995](../src/index.css#L985-L995) zera toda animação e transição em `0,001ms`. Isso congela os 513 spinners `animate-spin` e as transições que mostram mudança de estado. Melhor manter as animações de opacidade e cortar só deslocamento e escala, que é o que o [tokens.css](../src/styles/tokens.css) já faz para `.stagger`. → `$impeccable animate`
- **Chama pulando sem parar** no SLA vencido ([HelpdeskSlaBadge.tsx:48](../src/views/helpdesk/HelpdeskSlaBadge.tsx#L48), `animate-bounce` infinito). Numa fila com dez chamados vencidos, a tela inteira pula. Use um ícone fixo vermelho, ou um anel que pulsa uma vez. → `$impeccable quieter`
- **Desvios de paleta apontados pelo detector:** 22 faixas laterais grossas (`border-l-4` como enfeite de cartão em [Estoque.tsx:519](../src/views/Estoque.tsx#L519), [HistoricoPedidos.tsx:550](../src/views/HistoricoPedidos.tsx#L550), [Compras.tsx:3153](../src/views/Compras.tsx#L3153)) e 16 gradientes índigo/violeta fora da marca verde ([setoresVisual.ts](../src/components/treinamentos/setoresVisual.ts), [Formularios.tsx:105](../src/views/Formularios.tsx#L105), [AdminChatbot.tsx:196](../src/components/admin/AdminChatbot.tsx#L196)). O `border-l-4` do item ativo do menu é uso legítimo. → `$impeccable polish`
- **`theme-color` claro é azul** (`#0056c6`, [index.html:9](../index.html#L9)) e a marca é verde (`#059669`). Confirme se é intencional; senão, a barra do navegador no celular fica de outra cor.

---

## Padrões sistêmicos

1. **Contraste e tamanho foram decididos tela a tela.** `slate-400` + `text-[10px]` virou o jeito padrão de escrever um rótulo secundário. Sem um piso documentado, cada tela nova repete a combinação.
2. **Os componentes compartilhados existem, mas têm concorrência.** `Modal` (137 usos) disputa com 24 modais à mão, e `ConfirmDialog` (50) com 16 `confirm()`. Consertar o componente central só alcança quem o usa.
3. **Celular é o uso principal, mas falta a regra global de toque.** A conversão de tabela em cartões já foi resolvida no CSS central. A fonte de 16px nos campos e a altura mínima de toque ainda não.

## O que está bom e deve ser mantido

- **Tokens de gráfico com paleta validada** nos dois temas ([tokens.css](../src/styles/tokens.css)) e 3.425 usos de `var(--series|chart|ink|surface)`. É o melhor pedaço do front.
- **Modal que vira gaveta** no celular, com `dvh`, `safe-area` e proteção contra fechar ao arrastar uma seleção para fora do painel.
- **Rede de tabela → cartões** no CSS central, com saída `data-no-cards` para tabelas agrupadas.
- **Todas as imagens têm `alt`**, e só 23 `outline-none` aparecem sem foco substituto, entre 593.
- **Toasts anunciados** (`aria-live="polite"`, `role="status"`).
- **Quadros de assinatura** ([SignaturePadModal.tsx](../src/components/portaria/SignaturePadModal.tsx), [ColetaAssinaturaTablet.tsx](../src/components/qualidade/ColetaAssinaturaTablet.tsx)) com `touch-action` e `pointercancel`: assinar não rola a página nem trava o traço.
- **Chunk principal caiu de 2,13 MB (27/10) para 1.072 KB** (300 KB gzip), com rotas em `lazy()`. A fase 1 de redução de carga funcionou.

---

## Ordem sugerida

| # | Sev. | Ação | Esforço | Alcance |
|---|---|---|---|---|
| 1 | P1 | Regra de 16px nos campos no celular | 1 regra CSS | todos os formulários |
| 2 | P1 | Escuro: bloco global só onde não há `dark:`, sem `!important`; `--text-muted` → `--ink-muted` | `index.css` + revisão visual de 7 telas | ~7.700 classes voltam a valer |
| 3 | P1 | Escuro sem clarão: script no `<head>` + `prefers-color-scheme` + `color-scheme` | `index.html` + `App.tsx` | toda recarga |
| 4 | P1 | Pilha de foco, Esc e trava de rolagem no `Modal.tsx` | 1 arquivo | 137 telas |
| 5 | P1 | Precache só do shell e dos formulários offline | `vite.config.ts` | todo aparelho |
| 6 | P1 | `text-slate-400` → `text-slate-500` no tema claro | varredura | ~1.500 textos |
| 7 | P1 | Piso de fonte 11/12px | varredura + revisão das 4 telas mais densas | ~3.600 usos |
| 8 | P2 | Escuro: escada de elevação (modal no nível 3), selos pastel, campos `time`/`search` | `tokens.css` + `index.css` | modais, selos, Portaria |
| 9 | P2 | Componente `<Campo>`: rótulo ligado, `aria-invalid`, foco no primeiro erro, `enterKeyHint` | 1 componente + migração por formulário | 390 campos |
| 10 | P2 | `wheel` → `blur` em `type=number`; `inputMode="decimal"` em quantidades | 1 listener global | 68 campos |
| 11 | P2 | Título da aba por rota | `App.tsx` | todas as abas |
| 12 | P2 | xlsx 0.20.3, uma biblioteca só | dependência + 66 imports | −1,2 MB, fecha a vulnerabilidade |
| 13 | P2 | `aria-label` nos botões só-ícone; `<nav>`/`aria-current` no menu; ações visíveis no toque | mecânico | 218 botões, 18 ações |
| 14 | P2 | Migrar os 24 modais à mão e os 16 `confirm()` | por módulo, quando for mexido | — |
| 15 | P3 | Movimento reduzido seletivo; SLA sem pulo; paleta; `active:`; esqueleto; z-index; emoji | polimento | — |

Os itens 1 a 4 mexem em quatro arquivos e não tocam em nenhuma tela.

Depois dos P1, rode `$impeccable audit` de novo para comparar o placar, e feche com `$impeccable polish`.
