---
name: "trilha-gamificada-po"
description: "Transforma o PDF de um Procedimento Operacional (PO) da TEN numa trilha de treinamento gamificada em HTML: missões animadas, jogos, quiz, insígnias e certificado."
---

# Trilha gamificada a partir de um PO

Use quando o usuário enviar o PDF de um procedimento (PO.SUP-xxxx, PO.ALM-xxxx, PO.FIN-xxxx etc.) e pedir uma trilha, curso, treinamento animado ou "o do PO-xxxx em HTML". O resultado segue o padrão já aprovado das trilhas PO.SUP-0004 (Processo de Compras) e PO.SUP-0010 (Gestão de Contratos e Serviços).

Entregáveis: (1) página publicada como Artifact para revisão; (2) arquivo HTML único "standalone" para baixar e incorporar no SISTEN; (3) lista de inconsistências encontradas no PDF; (4) resumo salvo no projeto.

## Passo 0 · Pegar o motor

O motor é igual para todas as trilhas. Só muda o arquivo de missões.

1. Os arquivos do motor vêm junto com esta skill, em `assets/motor/` (caminho relativo a este SKILL.md): `style.css`, `body.html`, `helpers.js`, `engine.js`, `build.py`, `qa.py` e `exemplo-missions-sup0010.js` (trilha completa de referência). Copie a pasta inteira para a pasta de trabalho.
2. Se `assets/motor/` não estiver acessível, procure no projeto Supply (`project_read` em `claude/motor-trilhas/<arquivo>`). Em último caso, leia o Artifact da trilha PO.SUP-0010 (https://claude.ai/artifact/ABQrZkeDcfTqpcVJh3cxUL): no `<script>`, o bloco de missões começa em `/* ================= Trilha` e termina no fim de `const CFG={...};`; antes dele é `helpers.js`, depois é `engine.js`; o `<style>` é `style.css` e o HTML entre `</style>` e `<script>` é `body.html`.
3. Não altere o motor para uma trilha específica. Vinheta, simulador ou ícone novo entra de forma genérica em `helpers.js`, `style.css` ou `body.html`.
4. Dependências: `python3`, `node`, `pdftotext` (poppler-utils) e, para o QA, Playwright com Chromium (`pip install playwright` e `playwright install chromium` se ainda não houver navegador).

## Passo 1 · Ler o PDF por inteiro

- Extraia o texto com `pdftotext arquivo.pdf saida.txt` (sem `-layout`; remova linhas soltas da marca d'água "Cópia não controlada").
- Tabelas e quadros costumam ser imagem: abra essas páginas com `Read` e `pages` para ver (ex.: faixas de avaliação, matrizes, alçadas).
- Anote: código, revisão, data de emissão, emissor, aprovador, objetivo, definições/papéis, cada etapa com responsável, prazo, sistema/transação, formulário (FRM.xxx), valores, regras de exceção e anexos.
- Monte a lista de inconsistências: números que divergem dentro do próprio PDF ou de outros POs já transformados em trilha (ver docs do projeto), referências a itens inexistentes, valores estranhos (ex.: "Até 1 USD"), nomes de cargo diferentes. Nunca corrija sozinho: use o que está escrito e reporte.

## Passo 2 · Planejar as missões

- 8 a 12 missões. A primeira é sempre "Por que o processo existe" (objetivo, escopo e papéis). A última é sempre "Desafio final" (revisão + rodada mista + 8 perguntas de 15 s).
- Cada missão cobre um bloco do procedimento, com 3 a 8 cenas. Uma cena = uma ideia.
- Escolha um exemplo fio condutor realista da TEN (ex.: 600 discos de desbaste; manutenção das pontes rolantes) e use-o nas cenas, marcando-o como ilustrativo.
- Onde houver regra numérica (faixas de valor, alçada, prazo × valor, nota de avaliação), coloque um simulador interativo numa cena (`widget`, `hold:true`).
- Onde houver sequência obrigatória de etapas, use o jogo `order` (as próprias cenas viram as cartas, na ordem certa).
- Para classificação/decisão, use o jogo `deck`.

## Passo 3 · Escrever o arquivo de missões

Crie `missions-<codigo>.js` seguindo exatamente a estrutura de `exemplo-missions-sup0010.js`. Ele deve definir `M`, `GINST` e `CFG`.

### Missão
```js
{ n:1, short:'Título curto (mapa/HUD)', title:'Título com <span>destaque</span>', ic:'idDoIcone', badge:'Nome da insígnia', gameName:'Nome do jogo',
  chips:[['5 cenas',''],['dado-chave','o'],['≈ 4 min','t']],
  intro:'2 frases dizendo por que o assunto importa.',
  scenes:[...], game:{...}, quiz:[...], qtime:15 /* só no desafio final */, hero:()=>html /* opcional */ }
```

### Cena
```js
{ ic:'icone', t:'Título curto', x:'Texto humanizado com <b>1 a 2 destaques</b>.', chips:[['texto','o'|'t'|'b'|'']],
  vig:()=>vf(...)        // animação; ou
  widget:'alc', hold:true, // simulador interativo (sem vig)
  doc:'RM', st:'Status do documento', // opcional: documento que "viaja"
  k:3, kl:'dias úteis' }    // opcional: número grande no canto (número inteiro anima)
```
O texto `x` aparece ao lado da animação, alternando esquerda/direita. 35 a 60 palavras.

### Vinhetas disponíveis (helpers.js)
- `vf(icone|letra, titulo, [[fato,cls]...], tom, [[requisito,cls]...])` genérica: ícone ou letra de 1 caractere, título e chips. tom: '', 'o', 'ok', 'bad'.
- `vIcons([[icone,rotulo]...])` grade de ícones (papéis, categorias, critérios).
- `vForm(titulo,codigo,linha)` formulário se preenchendo. `vAppr(doc,codigo,carimbo,quem,iconeQuem,ruim)` documento carimbado.
- `vProps([[nome,preco,sub,tagAtraso]...])` propostas chegando. `vSend(textoOk)` envio ao fornecedor. `vRoad([marco1,marco2,marco3])` caminhão em trânsito. `vWH(textoOk)` recebimento no almoxarifado.
- `vLanes([[rotulo,texto,pct,cor,corTexto,dur]...])` barras comparativas (prazos, multas, faixas). Cores: 'var(--s-teal)', 'var(--s-orange)', 'var(--s-blue)', 'var(--s-bad)'.
- `vChecklist(titulo,[itens],indiceFaltando|-1,textoOk,textoPendente)` lista de documentos com item faltando.
- `vFolder(caminho,[itens])` arquivamento em pasta da rede. `vSign(doc,[assinantes])` assinatura eletrônica.
- `vLadder(n)` escada de alçadas N1–N7 até o nível n. `vStop()` linha parada. `vPillars()` 3 pilares. `vScope()` escopo com pessoas. `vNoPC()` proibido sem PC. `vSap()` PC/Contrato no SAP.
- Específicas da trilha de compras (conteúdo fixo, reutilize só se fizer sentido): `vQQP`, `vPC`, `vRace`, `vOne`, `vLate`, `vLaudo`, `vWeights`, `heroDonut`.

### Simuladores (widget)
`cot` (valor → nº de cotações), `alc` (valor do PC → alçada N1–N7), `aval` (8 critérios com pesos da PO.SUP-0004), `contrato` (valor × duração → contrato e multa), `aval5` (5 critérios atendidos → resultado). Novo simulador: `W.nome=function(el){...}` em helpers.js, com ids estáveis nos inputs.

### Ícones
`i1` documento, `i2` aprovação, `i3` propostas, `i4` gráfico, `i5` caneta, `i6` envio, `i7` caminhão, `i8` armazém, `ifac` fábrica, `ialert`, `iban` proibido, `icol` pilares, `iusers`, `ical`, `ibolt` urgente, `iwrench`, `iboxes`, `ishield`, `iumb`, `icoin`, `iladder`, `itag`, `itree`, `iflame`, `ifood`, `idrop`, `ihaz`, `iclip`, `istar`, `imail`, `idb` sistema, `ileaf`, `iheart`, `iscale`, `itarget`, `ibook`, `iflag`, `iflow`, `iwind` torre, `ichk`, `iaward`, `iid` crachá, `ifold` pasta, `ilock`, `iun` desbloqueio, `irep` repetir, `iclk` relógio. Ícone novo: acrescente um `<symbol id="..." viewBox="0 0 24 24">` em body.html (traço, sem preenchimento).

### Jogos
- `{type:'order', title:'...'}`: usa as cenas da missão na ordem em que estão.
- `{type:'deck', title:'...', buckets:['A','B','C'], cards:[{t:'caso',a:índiceCerto,s:'rótulo opcional'}]}`: 6 a 10 cartas, 2 a 6 baldes.
- Rodada mista: sem `buckets`; cada carta traz `b:['op1','op2','op3']` e `s:'tema'`.

### Quiz
4 perguntas por missão (8 no desafio final, com `qtime:15`). `{q:'pergunta curta', o:['a','b','c'], a:índice, e:'explicação de 1 linha com <b>resposta</b>'}`. O motor embaralha as alternativas; os distratores devem ser plausíveis.

### CFG
```js
const CFG={code:'PO.SUP-0010', rev:'07', name:'Nome do procedimento', hero:'Nome com <span>destaque</span>', hud:'Trilha de ...',
  key:'trilha-sup0010-v1', origem:'trilha-sup0010', title:'Trilha PO.SUP-0010',
  levels:[[0,'...'],[400,'...'],[1100,'...'],[2000,'...'],[3200,'...'],[4400,'...']], // 6 níveis com nomes do tema
  guide:t=>`<div class="gcard"><h3>${ic('iclk')}Prazos</h3>${t(['Etapa','Prazo'],[['...','...']])}</div> ...`};
```
`key` e `origem` devem ser únicos por trilha (progresso e eventos não se misturam). O guia de bolso reúne prazos, valores, alçadas, formulários e sistemas do PO, um card por tema.

## Regras de conteúdo

- Todo número, prazo, cargo, formulário e transação vem do PDF. Nada inventado. Exemplos (valores, fornecedores) são ilustrativos e o rodapé já avisa.
- Transações SAP: só as citadas no PDF ou consolidadas na TEN (ME51N criar RM/RS, ME54N liberar RM, ME21N criar PC, ME29N liberar PC, ME2N PCs abertos, MIGO 101 entrada). Não invente outras.
- Português do Brasil, tom de colega experiente falando com o colaborador ("você"), frases curtas, exemplos do chão de fábrica. Evite jargão de IA, travessões em excesso, "não é X, é Y" e frases de efeito.
- Visual TEN: navy, laranja e teal; não mude as cores do motor.
- Strings JS entre aspas simples: não use apóstrofo dentro delas. Caminho de rede com `\\` (ex.: `'G:\\Contratos'`).

## Build

```bash
python3 motor/build.py missions-<codigo>.js trilha-<codigo>
```
Gera `trilha-<codigo>.html` (para publicar) e `trilha-<codigo>-standalone.html` (para baixar). Se `build.py` não existir: concatene `<title>` + meta `claude:viewport-fit-sides` + links do Google Fonts (Barlow Condensed, Source Sans 3, JetBrains Mono) + `<style>style.css</style>` + body.html + `<script>helpers.js + missions + engine.js</script>`; o standalone é o mesmo dentro de `<!doctype html><html lang="pt-BR"><head>…</head><body>…</body></html>`.

## QA (obrigatório antes de entregar)

1. Sintaxe: `node -e "new Function(require('fs').readFileSync('trilha-<codigo>.html','utf8').split('<script>')[1].split('</script>')[0])"`.
2. Confira que cada cena tem `x`, cada carta tem `a` válido e cada pergunta tem 3 opções.
3. `python3 motor/qa.py trilha-<codigo>.html prints/` joga todas as missões (desktop e celular) e salva prints. Deve terminar com `errors []` e `mobile sw 390`.
4. Veja os prints em folhas de contato (PIL) e corrija textos cortados, sobreposição ou vinheta vazia. Um ciclo de correção, sem loop.

## Entrega

1. Se a ferramenta Artifact existir, publique `trilha-<codigo>.html` (caminho de arquivo novo = link novo; ícone genérico, ex.: `document`).
2. Entregue o standalone como arquivo: em sessões com `/mnt/user-data/outputs/`, copie para lá e envie com `SendUserFile`; em outros ambientes (ex.: Claude Code), deixe `trilha-<codigo>-standalone.html` na pasta do usuário e informe o caminho.
3. Responda curto: o que a trilha tem (missões, simuladores), que foi testada, e a lista de inconsistências do PDF para o usuário validar.
4. Se houver projeto com a ferramenta Projects, salve `claude/trilha-<codigo>.md`: link, fonte (código, revisão, emissor, aprovador), missões e jogos, pontos a validar.

## Integração SISTEN (já embutida no motor)

- Incorporar por iframe: `trilha.html?usuario=ID&nome=Nome%20Completo` (`revisao=1` abre todas as missões).
- O progresso fica no localStorage do navegador, separado por `usuario`.
- Eventos `postMessage` para a página-mãe: `{origem:CFG.origem, evento:'missao-concluida', usuario, missao, titulo, insignia, xpMissao, estrelas, acertos, perguntas, errosJogo, xpTotal, missoesConcluidas}` e `{evento:'trilha-concluida', xpTotal, nome}`. O SISTEN grava esses eventos no banco para ter o histórico da equipe.