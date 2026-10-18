"""Monta uma trilha a partir do motor + um arquivo de missões.
Uso: python3 build.py missions.js nome-saida
Gera: nome-saida.html (para publicar como Artifact) e nome-saida-standalone.html (para baixar/SISTEN)."""
import sys,re,os
here=os.path.dirname(os.path.abspath(__file__))
r=lambda p:open(os.path.join(here,p),encoding='utf-8').read()
missions=open(sys.argv[1],encoding='utf-8').read(); out=sys.argv[2]
title=re.search(r"title:\s*'([^']+)'",missions[missions.index('const CFG'):]).group(1)
fonts=('<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
 '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Source+Sans+3:wght@400;600;700&family=JetBrains+Mono:wght@500&display=swap">\n')
style='<style>\n'+r('style.css')+'</style>\n'
script='<script>\n'+r('helpers.js')+'\n'+missions+'\n'+r('engine.js')+'</script>\n'
body=r('body.html')
open(out+'.html','w',encoding='utf-8').write(f'<title>{title}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'+fonts+style+body+script)
open(out+'-standalone.html','w',encoding='utf-8').write('<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
 +f'<title>{title}</title>\n'+fonts+style+'</head>\n<body>\n'+body+script+'</body>\n</html>\n')
print('ok',out+'.html',out+'-standalone.html')
