"""Gera a trilha "Reforma Tributária" do SISTEN a partir do TEN-Jornada-Tributaria.html.

Mantém só Comparar NF, Comparar cotação e Fontes (sem menu lateral), troca a
paleta pela do SISTEN com tema escuro derivado, põe os mapas de cotação lado a
lado e liga o progresso ao protocolo de trilhas do SISTEN.
"""
import base64, colorsys, os, re, sys

# Uso (na raiz do repo): python scripts/gerar-trilha-reforma-tributaria.py
# Regerar sempre que docs/TEN-Jornada-Tributaria.html for atualizado.
SRC, OUT_HTML, OUT_PDF = (sys.argv[1:4] if len(sys.argv) >= 4 else
    ['docs/TEN-Jornada-Tributaria.html', 'public/treinamentos/trilha-reforma-tributaria.html',
     'public/treinamentos/reforma-tributaria-apostila.pdf'])
PDF_URL = 'treinamentos/reforma-tributaria-apostila.pdf'

h = open(SRC, encoding='utf-8').read()
scripts = re.findall(r'<script>(.*?)</script>', h, re.S)
styles = re.findall(r'<style>(.*?)</style>', h, re.S)
assert len(scripts) == 6 and len(styles) == 2

# ---------------------------------------------------------------- PDF
m = re.search(r"atob\('([A-Za-z0-9+/=]+)'\)", scripts[0])
pdf = base64.b64decode(m.group(1))
assert pdf[:5] == b'%PDF-'
open(OUT_PDF, 'wb').write(pdf)

def sub1(text, old, new, count=1):
    n = text.count(old)
    assert n == count, (old[:80], n)
    return text.replace(old, new)

def chunks(js):
    """Divide um script em blocos de nível superior (function/const/let)."""
    idx = [m.start() for m in re.finditer(r'^(?=function \w+\(|const \S|let \S|\$\()', js, re.M)]
    out = {}
    for a, b in zip(idx, idx[1:] + [len(js)]):
        bloco = js[a:b]
        if bloco.startswith('$('):
            out['__ligacoes__'] = out.get('__ligacoes__', '') + bloco
            continue
        nome = re.match(r'(?:function |const |let )?([\w$]+)', bloco).group(1)
        assert nome not in out, nome
        out[nome] = bloco
    return out

# ---------------------------------------------------------------- JS
dados, compara, cotacao, licoes, casca = scripts[1:]

d = chunks(dados)
js_dados = ''.join(d[k] for k in ['SOURCES', 'SCENARIOS', 'NF_STEPS', 'YEARS', 'GLOSSARY'])

# Comparar NF: sem links para páginas que não existem aqui.
compara = sub1(compara, '<a class="btn outline small" href="#notas">Abrir uma NF completa ↗</a>', '')
compara = sub1(compara, '<a href="#fontes">Consultar apostila, fontes e limites de todas as simulações</a>',
               '<button class="textlink" data-tab="fontes">Consultar apostila, fontes e limites de todas as simulações</button>')
compara = sub1(compara, '<a class="btn outline" href="#auditoria">Praticar a auditoria desta leitura</a><a class="btn outline" href="#fornecedor">Orientar o fornecedor se houver erro</a>', '')

# Comparar cotação
cotacao = sub1(cotacao, '<a class="textlink" href="#fornecedor">Preparar orientação ao fornecedor →</a>', '')
cotacao = sub1(cotacao, '<a href="#fontes">Ver fontes e hipóteses.</a>', '<button class="textlink" data-tab="fontes">Ver fontes e hipóteses.</button>')
cotacao = sub1(cotacao, 'Mapas com fontes ampliadas, um por linha. Em telas menores, deslize a tabela na horizontal.',
               'Os dois mapas ficam lado a lado, como as NFs: à esquerda hoje, à direita o ano escolhido. Valores que mudam entre os anos ficam destacados.')
# Mapas lado a lado: cada célula que muda em relação ao outro ano ganha destaque (como os campos da NF).
cotacao = sub1(cotacao, 'function qMap(y){const c=qCase(),models=qModels(y),winner=qWinner(y);',
               "function qMap(y){const c=qCase(),models=qModels(y),winner=qWinner(y),outroAno=y===2026?quoteState.year:2026,outros=qModels(outroAno),muda=(i,key)=>outroAno!==y&&(key==='extra'?false:Math.abs((models[i].m[key]||0)-(outros[i].m[key]||0))>=.01);")
cotacao = sub1(cotacao, "models.map(({v,m})=>`<td class=\"${winner?.ties.includes(v.id)&&key===(quoteState.pv?'present':'economic')?'best-cell':''}\" title=\"${esc(qMemo(v,m,key,y,c))}\">",
               "models.map(({v,m},i)=>`<td class=\"${winner?.ties.includes(v.id)&&key===(quoteState.pv?'present':'economic')?'best-cell':''} ${muda(i,key)?'q-changed':''}\" title=\"${esc((muda(i,key)?`[${y===2026?'Muda em '+outroAno:'Mudou em relação a 2026'}]\\n\\n`:'')+qMemo(v,m,key,y,c))}\">")
cotacao = sub1(cotacao, '<span class="badge">3 propostas fictícias</span>',
               "<div class=\"q-pane-total\"><small>${y===2026?'Hoje':'Ano selecionado'} · menor custo</small><b>${winner?money(winner.m.score):'—'}</b></div>")
# Botão de concluir a etapa no fim do Comparar cotação
cotacao = sub1(cotacao, 'Opção IBS/CBS do Simples para 2027 ↗</a></p></details>`}',
               'Opção IBS/CBS do Simples para 2027 ↗</a></p></details><div class="compare-next">${markButton(1)}</div>`}')

# Memória de cálculo visível (scripts/reforma-tributaria/memoria.js e .css): painel sob os dois mapas
cotacao = sub1(cotacao, '</p>${qWalkthrough()}${qEditors()}', '</p>${qMemoria()}${qWalkthrough()}${qEditors()}')
cotacao = sub1(cotacao, "bindQuoteLessons();\n on('#qExplainChange'",
               "bindQuoteLessons();\n document.querySelectorAll('[data-q-mem]').forEach(b=>b.onclick=()=>{quoteState.focus=b.dataset.qMem;qRedraw()});\n on('#qExplainChange'")

licoes = sub1(licoes, '<a class="btn outline" href="#fornecedor">Orientar o fornecedor em caso de divergência</a>', '')

c = chunks(casca)
manter = ['$', 'money', 'num', 'round', 'esc', 'persisted', 'state', 'toast', 'link', 'intro', 'notice', 'section',
          'fiscalModel', 'cell', 'group', 'invoice', 'library', 'glossary', 'download']
js_casca = ''.join(c[k] for k in manter)
js_casca = sub1(js_casca, '${TEN_EMBEDDED_PDF_URL}', PDF_URL)
js_casca = sub1(js_casca, "state={page:'inicio'", "state={page:'inicio'")
js_casca = sub1(js_casca, '<li><b>Dados:</b> progresso, checklist e respostas ficam neste navegador; não há cadastro de pessoas,',
                '<li><b>Dados:</b> no SISTEN, as etapas concluídas ficam no seu usuário; checklist e respostas valem só nesta sessão. Não há')

js_novo = r"""
/* ===================== SISTEN: casca da trilha ===================== */
const ABAS={inicio:'Comparar NF',cotacoes:'Comparar cotação',fontes:'Fontes e apostila'};
const ETAPAS=[{aba:'inicio',titulo:'Comparar NF',insignia:'Leitor de NF da Reforma'},{aba:'cotacoes',titulo:'Comparar cotação',insignia:'Comprador da Reforma'}];
const XP_ETAPA=100;
const EMBUTIDA=window.parent!==window;
const notify=(evento,dados)=>{try{if(EMBUTIDA)window.parent.postMessage(Object.assign({origem:'trilha-reforma-tributaria',evento},dados||{}),'*')}catch(e){}};
function save(){try{localStorage.setItem('ten-jornada-v1',JSON.stringify({done:state.done}))}catch{}updateProgress()}
function updateProgress(){const n=state.done.length;$('#progressText').textContent=`${n} de ${ETAPAS.length}`;$('#progressBar').style.width=(n/ETAPAS.length*100)+'%'}
function markButton(i){const feito=state.done.includes(i);return `<button class="btn ${feito?'light':''} small rt-done" data-done="${i}" ${feito?'disabled':''}>${feito?'✓ Etapa concluída · '+ETAPAS[i].titulo:'Concluir etapa · '+ETAPAS[i].titulo}</button>`}
function nav(){$('#tabs').innerHTML=Object.entries(ABAS).map(([id,t])=>{const i=ETAPAS.findIndex(e=>e.aba===id),ok=i>=0&&state.done.includes(i);return `<button role="tab" data-tab="${id}" aria-selected="${state.page===id}" class="${state.page===id?'active':''}">${t}${ok?'<span class="rt-ok" title="Etapa concluída">✓</span>':''}</button>`}).join('');updateProgress()}
function render(){if(!ABAS[state.page])state.page='inicio';nav();$('#main').innerHTML=({inicio:notes,cotacoes:quotesPage,fontes:library}[state.page])();$('#main').classList.remove('fade');void $('#main').offsetWidth;$('#main').classList.add('fade');bind()}
function irPara(aba){state.page=aba;render();window.scrollTo(0,0)}
function redraw(){const pos=window.scrollY;render();window.scrollTo(0,pos)}
function on(sel,event,fn){const el=$(sel);if(el)el.addEventListener(event,fn)}
function bind(){
 bindComparison();
 bindQuotes();
 document.querySelectorAll('[data-tab]').forEach(el=>el.onclick=()=>irPara(el.dataset.tab));
 document.querySelectorAll('[data-done]').forEach(el=>el.onclick=()=>{const i=+el.dataset.done;if(state.done.includes(i))return;state.done=[...state.done,i];save();
  notify('missao-concluida',{missao:i+1,titulo:ETAPAS[i].titulo,insignia:ETAPAS[i].insignia,xpMissao:XP_ETAPA,estrelas:3,missoesConcluidas:state.done.length});
  if(state.done.length===ETAPAS.length)notify('trilha-concluida',{xpTotal:XP_ETAPA*ETAPAS.length});
  toast(state.done.length===ETAPAS.length?'Trilha concluída. As duas etapas ficaram registradas no seu usuário.':`Etapa "${ETAPAS[i].titulo}" concluída.`);redraw()});
 on('#scenario','change',e=>{state.scenario=e.target.value;redraw()});
 on('#glossarySearch','input',e=>$('#glossary').innerHTML=glossary(e.target.value));
}
/* Progresso do usuário e tema vêm do SISTEN (iframe sandbox, sem localStorage). */
addEventListener('message',e=>{const d=e.data;if(e.source!==window.parent||!d||d.destino!=='trilha'||d.evento!=='carregar-progresso')return;
 const g=(d.progresso&&d.progresso.done)||{};
 state.done=[...new Set([...state.done,...Object.keys(g).filter(k=>g[k]).map(k=>+k-1).filter(i=>i>=0&&i<ETAPAS.length)])];
 if(d.tema==='dark'||d.tema==='light')document.documentElement.dataset.theme=d.tema;
 redraw()});
render();
notify('pronta');
"""

AQUI = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'reforma-tributaria')
js_icms = open(os.path.join(AQUI, 'icms.js'), encoding='utf-8').read()
js_simples = open(os.path.join(AQUI, 'simples.js'), encoding='utf-8').read()
js_memoria = open(os.path.join(AQUI, 'memoria.js'), encoding='utf-8').read()
css_memoria = open(os.path.join(AQUI, 'memoria.css'), encoding='utf-8').read()

# Fontes novas na aba "Fontes e apostila": as tabelas dos anexos usadas no cálculo do DAS
js_dados = sub1(js_dados, " rfb:{title:'Receita Federal — entenda a transição'",
  " sn1:{title:'LC 123/2006 — Anexo I (comércio), com a partilha de CBS e IBS',url:'https://legis.senado.leg.br/norma/40180341/publicacao/40181079',note:'Alíquotas, deduções e partilha por faixa, de 2027 a 2033. Texto compilado do Senado; não substitui o DOU.'},\n"
  " sn3:{title:'LC 123/2006 — Anexo III (serviços), com a partilha de CBS e IBS',url:'https://legis.senado.leg.br/norma/40180341/publicacao/40181117',note:'Alíquotas, deduções e partilha por faixa, de 2027 a 2033. Texto compilado do Senado; não substitui o DOU.'},\n"
  " rfb:{title:'Receita Federal — entenda a transição'")

js = '\n'.join([js_dados, compara, cotacao, licoes, js_casca, js_icms, js_simples, js_memoria, js_novo])

# ---- Crédito de CBS/IBS do fornecedor do Simples: calculado (simples.js), não digitado.
# Receita bruta de 12 meses e anexo de cada fornecedor do Simples nos exemplos (hipóteses, editáveis).
DAS_EXEMPLOS = [
 ("cbsDas:1200,ibsDas:39.9",                                          "anexo:'I',rbt12:1500000"),
 ("cbsDas:110,ibsDas:8",                                              "anexo:'III',rbt12:240000"),
 ("'Oficina Preventiva Beta','das',29000,{cbsDas:600,ibsDas:20}",     "'Oficina Preventiva Beta','das',29000,{anexo:'III',rbt12:1000000}"),
 ("'Projetar Beta','das',9200,{cbsDas:190,ibsDas:10,delivery:25}",    "'Projetar Beta','das',9200,{anexo:'III',rbt12:900000,delivery:25}"),
 ("'Calibração Beta','das',18000,{cbsDas:450,ibsDas:50,delivery:15}", "'Calibração Beta','das',18000,{anexo:'III',rbt12:360000,delivery:15}"),
 ("'Fixadores Beta','das',46,{cbsDas:480,ibsDas:20}",                 "'Fixadores Beta','das',46,{anexo:'I',rbt12:500000}"),
 ("'Tintas Beta','das',50,{cbsDas:480,ibsDas:20}",                    "'Tintas Beta','das',50,{anexo:'I',rbt12:450000}"),
]
for velho, novo in DAS_EXEMPLOS:
    js = sub1(js, velho, novo)
n_zero = js.count('cbsDas:0,ibsDas:0,')
assert n_zero >= 1, n_zero
js = js.replace('cbsDas:0,ibsDas:0,', '')   # campos antigos dos fornecedores regulares

js = sub1(js, 'creditCbs=v.cbsDas;creditIbs=v.ibsDas;', '{const d=qDasCredito(v,c,y,raw);creditCbs=d.cbs;creditIbs=d.ibs}')
# Crédito de ICMS na compra de optante do Simples (LC 123, art. 23): a parte de ICMS do DAS do fornecedor, em vez de zero.
js = sub1(js, "if(v.regime!=='regular')creditIcms=0;",
          "if(v.regime==='das')creditIcms=qDasIcms(v,c,y,raw);else if(v.regime!=='regular')creditIcms=0;")
js = sub1(js, "// ICMS de Simples não foi informado neste exercício: zero não é regra universal.",
          "// ICMS do fornecedor do Simples (bens): parte de ICMS do DAS dele (qDasIcms); o ISS do prestador do Simples não gera crédito.")
js = sub1(js, "Não foi informado crédito ICMS de Simples neste exemplo.",
          "O crédito de ICMS do fornecedor do Simples (bens) é a parte de ICMS do DAS dele, pela partilha do anexo e da faixa (LC 123, art. 23), e vai caindo na transição enquanto o IBS ocupa o lugar; o ISS pago no DAS não gera crédito.")
js = sub1(js, "ICMS/DAS atual é zero no exemplo por ausência de informação específica, não regra universal.",
          "O ICMS do fornecedor regular é calculado pelas UFs de origem e destino, e o crédito do fornecedor do Simples, pela partilha do DAS; o ISS segue como hipótese municipal (2% a 5%).")
js = sub1(js, "ICMS destacado de ${money(m.creditIcms)} aproveitado no regime não cumulativo",
          "${v.regime==='das'?qDasMemo(v,c,y,'icms'):`ICMS destacado de ${money(m.creditIcms)} aproveitado no regime não cumulativo`}")
js = sub1(js, 'v.cbsDas+v.ibsDas>total', 'qDasTotal(v,c,y,raw)>total')
js = sub1(js, "issues.push('Crédito DAS incompatível com o total');",
          "issues.push('Crédito DAS incompatível com o total');if(y>2026&&v.regime==='das'&&qDasCredito(v,c,y,raw).fora)issues.push('Receita do fornecedor acima do limite do Simples');")
js = sub1(js, "${qField('cbsDas','Crédito CBS do DAS informado para o lote futuro',v.cbsDas)}${qField('ibsDas','Crédito IBS do DAS informado para o lote futuro',v.ibsDas)}",
          "${v.regime==='das'?qEditorDas(v):''}")
js = sub1(js, "else if(key==='regime')next[key]=input.value;", "else if(key==='regime'||key==='anexo')next[key]=input.value;")
js = sub1(js, r"Crédito admitido pelo Simples informado na proposta: ${money(m.creditCbs)}", r"${qDasMemo(v,c,y,'cbs')}")
js = sub1(js, r"Crédito admitido pelo Simples informado na proposta: ${money(m.creditIbs)}", r"${qDasMemo(v,c,y,'ibs')}")
js = sub1(js, "Os valores CBS/IBS informados no editor são hipóteses para o lote no ano futuro selecionado e precisam ser atualizados a cada ano com a evidência fiscal; não são alíquotas oficiais.",
          "O crédito de CBS e IBS é <b>calculado</b>, não digitado: receita bruta dos últimos 12 meses do fornecedor → faixa do anexo → alíquota efetiva → parte de CBS e de IBS na partilha do ano (LC 123, anexos da reforma; limite do crédito na LC 214/2025, art. 47, § 9º, II). Anexo e receita de cada fornecedor são hipóteses dos exemplos, editáveis no editor das propostas; a Resolução CGSN 190/2026, que detalha o procedimento, não foi lida. Fator R, sublimites e a fórmula especial do ISS acima de 14,92537% na faixa 5 do Anexo III não são tratados.")
js = sub1(js, "enquanto o DAS tem somente os valores informados", "enquanto o DAS tem somente o crédito devido no regime, calculado pela partilha do anexo")
js = sub1(js, "offer:'Proposta fictícia: lote por R$ 79.800,00, fornecedor mantém IBS/CBS no DAS e promete crédito de R$ 21.147,00 (26,5%). O exercício informa CBS devida de R$ 1.200,00 e IBS de R$ 39,90 no regime.'",
          "get offer(){return qErroDasOferta()}")
js = sub1(js, "explain:'O comprador regular não recebe crédito integral automaticamente pelo seu próprio regime. Neste exercício, o limite informado é R$ 1.239,90; R$ 21.147,00 superestima o crédito em R$ 19.907,10. Os valores do DAS são hipóteses para o lote, não alíquotas legais.'",
          "get explain(){return qErroDasExplica()}")
assert 'cbsDas' not in js.replace(js_memoria, '') and 'ibsDas' not in js.replace(js_memoria, ''), 'sobrou cbsDas/ibsDas'

# ---- ICMS do fornecedor regular: calculado pelas UFs de origem e destino (icms.js), não digitado.
js = sub1(js, "const icms2026=c.kind==='service'||c.benefit||v.regime!=='regular'?0:v.icms;",
              "const icms2026=c.kind==='service'||c.benefit||v.regime!=='regular'?0:qIcmsV(v,c);")
js = sub1(js, "rateI=v.regime==='regular'&&c.kind==='goods'?v.icms*YEARS[y].legacy/100:0;",
              "rateI=v.regime==='regular'&&c.kind==='goods'?qIcmsV(v,c)*YEARS[y].legacy/100:0;")
js = sub1(js, "× alíquota ${v.icms}% = ${money(m.icms)}", "× alíquota ${qIcmsV(v,c)}% (${qIcmsUF(v,c).texto}) = ${money(m.icms)}")
js = sub1(js, "da original de ${v.icms}%)", "da original de ${qIcmsV(v,c)}%; ${qIcmsUF(v,c).texto})")
js = sub1(js, "${qField('icms','ICMS original hipotético (%)',v.icms)}", "${qEditorImposto(v)}")
js = sub1(js, "(key==='icms'&&n>=100)", "(key==='iss'&&(n<2||n>5))")
js = sub1(js, "Revise os valores: positivos, alíquota menor que 100% e dias inteiros até 365.", "Revise os valores: positivos, ISS entre 2% e 5% e dias inteiros até 365.")
js = sub1(js, "as alíquotas de ICMS são premissas, não enquadramento confirmado da TEN.",
              "as alíquotas de ICMS são calculadas pelas UFs de origem e destino (7% interestadual do Sul/Sudeste para o Nordeste; 20,5% interna da Bahia) e não confirmam enquadramento, benefício nem crédito da TEN.")
js = re.sub(r'(?<=[,{])icms:[\d.]+,', '', js)        # ... discount:0,icms:7,iss:0 ...
js = re.sub(r',icms:[\d.]+(?=\})', '', js)           # {uf:'SP',icms:7}
js = re.sub(r'\{icms:[\d.]+\}', '{}', js)            # {icms:20.5}
assert not re.search(r'[,{]icms:[\d.]+', js), re.findall(r'.{30}[,{]icms:[\d.]+.{10}', js)[:3]
assert 'v.icms' not in js.replace(js_memoria, ''), 'sobrou v.icms'
assert 'href="#' not in js.replace('href="#"', ''), re.findall(r'href="#\w+"', js)

# ---------------------------------------------------------------- CSS
css = '\n'.join(styles)
css = re.sub(r"@import url\([^)]*\);?", '', css)
css = re.sub(r"^\s*500;600;700;800&family=DM\+Sans[^\n]*\n", '', css, flags=re.M)
css = css.replace("'DM Sans'", "'Inter'").replace('Barlow', "'Archivo'")

def to_rgb(c):
    c = c.lower()
    if c in ('white',): return (255, 255, 255, None)
    if c in ('black',): return (0, 0, 0, None)
    c = c[1:]
    if len(c) in (3, 4): c = ''.join(ch * 2 for ch in c)
    r, g, b = (int(c[i:i + 2], 16) for i in (0, 2, 4))
    a = c[6:8] if len(c) == 8 else None
    return (r, g, b, a)

def hexc(r, g, b, a=None):
    return '#%02x%02x%02x%s' % (round(r), round(g), round(b), a or '')

def hls(r, g, b): return colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
def rgb(h_, l, s): return tuple(x * 255 for x in colorsys.hls_to_rgb(h_, l, s))

# Paleta-base do SISTEN para as variáveis do :root original
BASE = {'--blue': '#2563eb', '--navy': '#1e3a8a', '--navy-bg': '#1e3a8a', '--ink': '#0f172a', '--muted': '#64748b', '--bg': '#f8fafc',
        '--line': '#e2e8f0', '--yellow': '#f59e0b', '--green': '#059669', '--red': '#dc2626'}
BASE_DARK = {'--blue': '#3b82f6', '--navy': '#93c5fd', '--navy-bg': '#1e3a8a', '--ink': '#e2e8f0', '--muted': '#94a3b8', '--bg': '#020617',
             '--line': '#1e293b', '--yellow': '#fbbf24', '--green': '#34d399', '--red': '#f87171'}

def claro(r, g, b):
    """Leva o azul-petróleo do TEN para o azul do SISTEN (só matiz)."""
    h_, l, s = hls(r, g, b)
    if 0.48 <= h_ <= 0.6 and s > 0.12:
        h_ = 0.6
    return rgb(h_, l, s)

def escuro(r, g, b):
    h_, l, s = hls(r, g, b)
    if l >= 0.995: return rgb(0.61, 0.11, 0.47)          # branco (cartão) -> slate-900
    if l >= 0.9:   return rgb(h_, 0.08 + (1 - l) * 1.4, min(s, 0.45))  # fundos claros -> tons escuros
    if l >= 0.6:   return rgb(h_, max(0.2, 1.08 - l), min(s, 0.4))      # bordas
    if s > 0.45 and l > 0.32: return rgb(h_, max(l, 0.62), s)            # cores de marca
    return rgb(h_, min(0.92, 1.02 - l), min(s, 0.35))                   # textos

COR = r'#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|(?<![\w-])white(?![\w-])|(?<![\w-])black(?![\w-])'
def declaracoes(texto):
    """Só o conteúdo das declarações: evita seletores de id com letras hex (#fade)."""
    return ''.join(re.findall(r'\{[^{}]*\}', texto))
cores = sorted(set(re.findall(COR, declaracoes(css))), key=str)
var_claro, var_escuro = {}, {}
for cor in cores:
    r, g, b, a = to_rgb(cor)
    nome = '--k-' + (cor.lower().lstrip('#') if cor.startswith('#') else cor)
    var_claro[nome] = hexc(*claro(r, g, b), a)
    var_escuro[nome] = hexc(*escuro(*claro(r, g, b)), a)

def troca(mo):
    cor = mo.group(0)
    return 'var(--k-%s)' % (cor.lower().lstrip('#') if cor.startswith('#') else cor)

# Não mexe nas variáveis-base do :root original (são redefinidas abaixo).
css = re.sub(r':root\{[^}]*\}', '', css, count=1)
def trata_bloco(mo):
    bloco = mo.group(0)
    # Texto branco sobre fundo de cor continua branco nos dois temas.
    bloco = re.sub(r'((?<![\w-])color:\s*)(white|#fff(?:fff)?)(?![\w])', r'\g<1>@@BRANCO@@', bloco)
    # Azul-marinho usado como FUNDO fica escuro nos dois temas (como texto, clareia no escuro).
    bloco = re.sub(r'(background(?:-color)?:\s*)var\(--navy\)', r'\g<1>var(--navy-bg)', bloco)
    bloco = re.sub(COR, troca, bloco)
    return bloco.replace('@@BRANCO@@', '#fff')
css = re.sub(r'\{[^{}]*\}', trata_bloco, css)

def bloco(d): return ';'.join(f'{k}:{v}' for k, v in d.items())
claro_all = {**BASE, **var_claro}
escuro_all = {**BASE_DARK, **var_escuro}
tokens = f"""
:root{{{bloco(claro_all)};--font:'Inter',Arial,sans-serif;--surface:#ffffff;color-scheme:light}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{{bloco(escuro_all)};--surface:#0f172a;color-scheme:dark}}
 :root:not([data-theme="light"]) :is(.q-rule-strip,.comparison-years .active,#toast){{{bloco(claro_all)}}}
 :root:not([data-theme="light"]) .paper{{{bloco(claro_all)};color-scheme:light;color:#0f172a}}}}
:root[data-theme="dark"]{{{bloco(escuro_all)};--surface:#0f172a;color-scheme:dark}}
:root[data-theme="dark"] :is(.q-rule-strip,.comparison-years .active,#toast){{{bloco(claro_all)}}}
:root[data-theme="dark"] .paper{{{bloco(claro_all)};color-scheme:light;color:#0f172a}}
"""

casca_css = r"""
/* ===================== SISTEN: casca e ajustes ===================== */
body{background:var(--bg);font-family:'Inter',Arial,sans-serif}
h1,h2,h3,h4{font-family:'Archivo','Inter',sans-serif}
.rt-head{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:16px;padding:10px 24px;background:var(--k-fff);border-bottom:1px solid var(--line);flex-wrap:wrap}
.rt-brand{display:flex;align-items:center;gap:10px;min-width:0}
.rt-logo{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#10b981,#0f766e);color:#fff;display:grid;place-items:center;font:700 17px 'Archivo',sans-serif;flex:none}
.rt-brand b{display:block;font:700 16px/1.15 'Archivo',sans-serif;color:var(--ink)}
.rt-brand small{display:block;font-size:11px;color:var(--muted)}
.rt-tabs{display:flex;gap:4px;padding:4px;border-radius:12px;background:var(--k-f3f7f9);margin-left:auto;overflow-x:auto;scrollbar-width:none}
.rt-tabs button{border:0;background:transparent;color:var(--muted);font:600 13px 'Inter',sans-serif;padding:7px 14px;border-radius:9px;white-space:nowrap;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.rt-tabs button:hover{color:var(--ink)}
.rt-tabs button.active{background:var(--k-fff);color:var(--blue);box-shadow:0 1px 2px #0f172a1f}
.rt-ok{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:50%;background:var(--green);color:#fff;font-size:10px}
.rt-prog{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--muted);white-space:nowrap}
.rt-prog .rt-track{width:90px;height:6px;border-radius:99px;background:var(--line);overflow:hidden}
.rt-prog .rt-track i{display:block;height:100%;width:0;background:linear-gradient(90deg,#14b8a6,#f97316);border-radius:99px;transition:width .6s}
main#main{padding:22px 24px 30px;max-width:1720px;margin:0 auto;min-height:0}
.rt-foot{max-width:1720px;margin:0 auto;padding:0 24px 24px;font-size:12px;color:var(--muted)}
.rt-done:disabled{cursor:default;opacity:1}
/* Cabeçalho fixo: o que é rolado até a vista não fica escondido embaixo dele. */
[id],.comparison-docs,.quote-maps{scroll-margin-top:72px}
.textlink{background:none;border:0;padding:0;color:var(--blue);font:inherit;font-weight:600;cursor:pointer;text-decoration:underline}
/* As duas NFs ocupam a altura da janela: dá para ler e comparar sem rolar a página. */
.invoice-window{height:clamp(420px,calc(100vh - 300px),920px)}
/* Mapas de cotação lado a lado, como as duas NFs */
.quote-maps{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:stretch}
.quote-map{display:flex;flex-direction:column}
.quote-map .tablewrap{flex:1;overflow-x:auto;overflow-y:visible;overscroll-behavior:auto}
.quote-map .pane-heading{padding:14px 16px}
.quote-map .pane-heading h2{font-size:22px}
.q-pane-total{text-align:right}
.q-pane-total small{display:block;font-size:10px;color:var(--muted)}
.q-pane-total b{font:600 19px 'Archivo',sans-serif;color:var(--ink)}
.quote-map:last-child .q-pane-total b{color:var(--blue)}
.quote-table{min-width:0;font-size:13px;line-height:1.5}
.quote-table td,.quote-table th{font-size:13px;padding:9px 11px}
.quote-table button{font-size:13px;line-height:1.35}
.quote-table thead button{font-size:14px}
.quote-table small{font-size:11px;margin-top:3px}
.quote-table .badge{font-size:11px}
.quote-table .cost-row td{font-size:15px}
.quote-table .cost-row button{font-size:13px}
.quote-table th:first-child,.quote-table td:first-child{width:34%}
.quote-table th:not(:first-child){width:22%}
.quote-table td.q-changed{background:var(--k-fff7dc);box-shadow:inset 0 -2px var(--k-e3bc3c)}
.quote-table tbody td[title]{cursor:help}
.quote-table .best-cell{background:#dcfce7 !important;color:#14532d !important;font-weight:800 !important;position:relative;box-shadow:inset 0 0 0 2px #16a34a,0 2px 8px #16a34a26 !important}
.quote-table .best-cell:after{content:'★ Menor custo';font-size:10px;font-weight:700;color:#14532d;display:inline-block;background:#bbf7d0;padding:2px 7px;border-radius:99px;margin-top:4px;border:1px solid #86efac}
.quote-table th.winner-vendor{background:#f0fdf4;border-top:3px solid #16a34a}
.winner-badge{display:inline-block;background:#16a34a;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;margin:3px 0 2px;letter-spacing:0.02em}
@media (prefers-color-scheme:dark){
 :root:not([data-theme="light"]) .quote-table .best-cell{background:#064e3b !important;color:#6ee7b7 !important;box-shadow:inset 0 0 0 2px #10b981,0 2px 8px #10b98133 !important}
 :root:not([data-theme="light"]) .quote-table .best-cell:after{background:#022c22;color:#a7f3d0;border-color:#059669}
 :root:not([data-theme="light"]) .quote-table th.winner-vendor{background:#064e3b33;border-top-color:#10b981}
 :root:not([data-theme="light"]) .winner-badge{background:#059669;color:#fff}
}
:root[data-theme="dark"] .quote-table .best-cell{background:#064e3b !important;color:#6ee7b7 !important;box-shadow:inset 0 0 0 2px #10b981,0 2px 8px #10b98133 !important}
:root[data-theme="dark"] .quote-table .best-cell:after{background:#022c22;color:#a7f3d0;border-color:#059669}
:root[data-theme="dark"] .quote-table th.winner-vendor{background:#064e3b33;border-top-color:#10b981}
:root[data-theme="dark"] .winner-badge{background:#059669;color:#fff}
.q-map-result{padding:14px 16px}
.q-map-result b{font-size:19px}
.q-map-result span{font-size:13px}
@media(max-width:1100px){.quote-table td,.quote-table th,.quote-table button{font-size:12px}.quote-table td,.quote-table th{padding:8px}}
@media(max-width:860px){.quote-maps{grid-template-columns:1fr}.quote-table{min-width:560px}}
@media(max-width:720px){
 .rt-head{padding:8px 12px;gap:8px}
 [id],.comparison-docs,.quote-maps{scroll-margin-top:112px}
 .rt-brand small{display:none}
 .rt-tabs{order:3;width:100%;margin-left:0}
 .rt-tabs button{flex:1;padding:8px 6px;font-size:12px;justify-content:center}
 .rt-prog .rt-track{width:56px}
 .rt-prog{margin-left:auto}
 main#main{padding:14px 12px 22px}
 .rt-foot{padding:0 12px 18px}
 .invoice-window{height:clamp(380px,calc(100vh - 180px),640px)}
 .quote-table{min-width:520px}
 .quote-table td,.quote-table th{font-size:13px;padding:9px 10px}
}
@media print{.rt-head{display:none}}
"""

head = """<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reforma Tributária</title>
<meta name="description" content="Trilha SISTEN: compare a mesma NF e o mesmo mapa de cotação ao longo da transição da reforma tributária (2026–2033).">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap">
"""
corpo = """</head>
<body>
<div class="rt-head">
  <div class="rt-brand"><span class="rt-logo" aria-hidden="true">%</span><div><b>Reforma Tributária</b><small>LC 214/2025 · transição 2026–2033</small></div></div>
  <nav class="rt-tabs" id="tabs" role="tablist" aria-label="Etapas da trilha"></nav>
  <div class="rt-prog" title="Etapas concluídas"><span id="progressText">0 de 2</span><div class="rt-track"><i id="progressBar"></i></div></div>
</div>
<main id="main" tabindex="-1"></main>
<p class="rt-foot">Casos fictícios para aprendizagem · aplicação operacional exige validação Fiscal · conteúdo de outubro de 2026 · apostila: Prof. Josedilson Amorim, JHA Consulting.</p>
<div id="toast" role="status"></div>
"""

out = head + '<style>\n' + tokens + css + casca_css + css_memoria + '\n</style>\n' + corpo + '<script>\n' + js + '\n</script>\n</body>\n</html>\n'
open(OUT_HTML, 'w', encoding='utf-8', newline='\n').write(out)
print('html', len(out), 'pdf', len(pdf), 'cores', len(cores))
