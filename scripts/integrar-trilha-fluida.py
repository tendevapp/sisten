"""Integra uma trilha gamificada (HTML gerado a partir de um PO) ao SISTEN
no padrão full-bleed fluido das trilhas de Suprimentos (PO.SUP-0004 e PO.SUP-0010),
sem escala artificial/fitbox, preenchendo a tela inteira do iframe com rolagem natural.

Uso:
    python scripts/integrar-trilha-fluida.py <trilha-standalone.html> public/treinamentos/<trilha>.html
"""
import os
import sys

if len(sys.argv) != 3:
    sys.exit("Uso: python scripts/integrar-trilha-fluida.py <entrada.html> <saida.html>")

entrada, saida = sys.argv[1], sys.argv[2]
h = open(entrada, encoding='utf-8').read().replace('\r\n', '\n')

# 1. Esconder 'Zerar progresso' quando embutido no SISTEN
antigo_rst = "<button class=\"btn\" type=\"button\" id=\"rstB\">${ic('irep')}Zerar progresso</button></div>`;"
if antigo_rst in h:
    h = h.replace(
        antigo_rst,
        "${EMB?'':`<button class=\"btn\" type=\"button\" id=\"rstB\">${ic('irep')}Zerar progresso</button>`}</div>`;",
        1
    )
    h = h.replace("$('rstB').onclick=e=>{", "if($('rstB'))$('rstB').onclick=e=>{", 1)

# 2. Mensagens com o SISTEN (postMessage)
aqui = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'trilha-sisten')
mensagens_js = open(os.path.join(aqui, 'mensagens.js'), encoding='utf-8').read().rstrip() + '\n'

fecho = "go('map');\n})();"
assert fecho in h, "Não foi possível localizar o ponto de montagem 'go(\\'map\\');\\n})();'"
h = h.replace(fecho, mensagens_js + "\ngo('map');\nnotify('pronta',{});\n})();", 1)

os.makedirs(os.path.dirname(os.path.abspath(saida)), exist_ok=True)
open(saida, 'w', encoding='utf-8', newline='\n').write(h)
print(f"Sucesso! Trilha integrada no padrão de Suprimentos: {saida} ({len(h)} bytes)")
