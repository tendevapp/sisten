"""Integra uma trilha gamificada (HTML gerado a partir de um PO) ao SISTEN.

Uso (na raiz do repo):
    python scripts/integrar-trilha-sisten.py <trilha-original.html> public/treinamentos/<trilha>.html

O que faz (blocos em scripts/trilha-sisten/, os mesmos da PO.SUP-0004):
  - encaixe: dentro do iframe do SISTEN (>= 760px) a trilha é escalada para
    caber na janela sem rolagem (reduz em janela pequena, amplia em tela cheia);
  - celular (<= 560px): sem escala, HUD numa linha, mapa em lista, botões largos;
  - mensagens: ao abrir avisa "pronta"; o SISTEN responde com o progresso do
    usuário (e o tema); "Zerar progresso" some quando embutida (o registro
    oficial é o do banco).

Pressupõe a estrutura das trilhas do skill trilha-gamificada-po (go('map'), notify,
placeToken, renderMap com #rstB). Cada troca confere que o trecho existe uma
única vez — se a trilha mudar de estrutura, o script para em vez de gerar
uma trilha quebrada. Rodar de novo sobre o original gera o mesmo resultado.
"""
import os
import sys

AQUI = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'trilha-sisten')
lê = lambda nome: open(os.path.join(AQUI, nome), encoding='utf-8').read().rstrip() + '\n'

if len(sys.argv) != 3:
    sys.exit(__doc__)
ENTRADA, SAIDA = sys.argv[1], sys.argv[2]

h = open(ENTRADA, encoding='utf-8').read().replace('\r\n', '\n')
assert 'id="fitbox"' not in h, 'Esta trilha já está integrada; parta do HTML original.'


def troca(texto, antigo, novo):
    n = texto.count(antigo)
    assert n == 1, f'esperava 1 ocorrência, achei {n}: {antigo[:90]!r}'
    return texto.replace(antigo, novo)


# --- CSS: encaixe antes de "Floating"; celular por último (vence os extras da trilha)
h = troca(h, '/* Floating */\n', lê('encaixe.css') + '\n/* Floating */\n')
h = troca(h, '</style>\n</head>', lê('mobile.css') + '</style>\n</head>')

# --- Estrutura: tudo (HUD + quadro) dentro de #fit, o canvas de confete fica de fora
h = troca(h, '<header class="hud" id="hud">', '<div id="fitbox"><div id="fit">\n<header class="hud" id="hud">')
h = troca(h, '\n</div>\n\n<canvas class="fx"', '\n</div>\n</div></div>\n\n<canvas class="fx"')

# --- Mapa: sem "Zerar progresso" dentro do SISTEN
h = troca(
    h,
    '<button class="btn" type="button" id="rstB">${ic(\'irep\')}Zerar progresso</button></div>`;',
    '${EMB?\'\':`<button class="btn" type="button" id="rstB">${ic(\'irep\')}Zerar progresso</button>`}</div>`;',
)
h = troca(h, "$('rstB').onclick=e=>{", "if($('rstB'))$('rstB').onclick=e=>{")

# --- Encaixe: a escala entra na posição do marcador da cena e a página é re-encaixada a cada tela
h = troca(h, "$('token').style.left=(r.left-tr.left+r.width/2)+'px';", "$('token').style.left=((r.left-tr.left+r.width/2)/FS)+'px';")
h = troca(h, "  hud();\n  const st=$('stage').getBoundingClientRect();", "  hud();encaixar();\n  const st=$('stage').getBoundingClientRect();")
h = troca(
    h,
    "addEventListener('resize',()=>{if(cur==='watch')placeToken()});",
    "addEventListener('resize',()=>{if(cur==='watch')placeToken()});\n\n" + lê('encaixe.js'),
)

# --- Mensagens com o SISTEN: antes do go('map') inicial; "pronta" depois
h = troca(
    h,
    "go('map');\n})();",
    lê('mensagens.js') + "\ngo('map');\nnotify('pronta',{});\n})();",
)

os.makedirs(os.path.dirname(os.path.abspath(SAIDA)), exist_ok=True)
open(SAIDA, 'w', encoding='utf-8', newline='\n').write(h)
print('ok', SAIDA, len(h))
