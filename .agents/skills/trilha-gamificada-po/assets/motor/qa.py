# QA: joga todas as missões e tira prints. Uso: python3 qa.py trilha-standalone.html pasta_prints/
import asyncio,sys,os
from playwright.async_api import async_playwright
import tempfile
SRC=sys.argv[1]; O=sys.argv[2].rstrip('/')+'/'; os.makedirs(O,exist_ok=True)
T=os.path.join(tempfile.gettempdir(),'trilha_qa.html')
async def main():
    html=open(SRC).read()
    open(T,'w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+html+'</body></html>')
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':1280,'height':900})
        errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        await pg.goto('file://'+T); await pg.wait_for_timeout(600)
        await pg.screenshot(path=O+'00_map.png',full_page=True)
        NM=await pg.evaluate('M.length')
        for n in range(1,NM+1):
            await pg.evaluate(f'__trilha.startMission({n})'); await pg.wait_for_timeout(700)
            if n in (1,7): await pg.locator('#stage').screenshot(path=O+f'{n:02d}_0brief.png')
            await pg.evaluate("__trilha.go('watch')"); await pg.wait_for_timeout(200)
            ns=await pg.evaluate('__trilha.R.m.scenes.length')
            for i in range(ns):
                await pg.click(f'.st[data-i="{i}"]'); await pg.wait_for_timeout(1900)
                await pg.locator('#scene').screenshot(path=O+f'{n:02d}_1s{i}.png')
            await pg.wait_for_timeout(1500)
            await pg.evaluate("__trilha.go('game')"); await pg.wait_for_timeout(300)
            typ=await pg.evaluate('__trilha.R.g.type')
            if typ=='order':
                await pg.locator('#stage').screenshot(path=O+f'{n:02d}_2game.png')
                for i in range(ns):
                    await pg.click(f'#s-game .card[data-i="{i}"]'); await pg.wait_for_timeout(120)
            else:
                N=await pg.evaluate('__trilha.R.g.N')
                for j in range(N):
                    if j==2: await pg.locator('#stage').screenshot(path=O+f'{n:02d}_2game.png')
                    a=await pg.evaluate('(()=>{const g=__trilha.R.g;return __trilha.R.m.game.cards[g.order[g.i]].a})()')
                    await pg.locator('.bkt').nth(a).click(); await pg.wait_for_timeout(400)
            await pg.wait_for_timeout(500)
            await pg.evaluate("__trilha.go('quiz')"); await pg.wait_for_timeout(200)
            Q=await pg.evaluate('__trilha.R.m.quiz.length')
            for q in range(Q):
                ai=await pg.evaluate('__trilha.R.q.ai'); await pg.locator('.opt').nth(ai).click(); await pg.wait_for_timeout(150); await pg.click('#qNext'); await pg.wait_for_timeout(150)
            await pg.wait_for_timeout(1200)
            if n in (8,12): await pg.locator('#stage').screenshot(path=O+f'{n:02d}_4result.png')
        await pg.click('#hudHome'); await pg.wait_for_timeout(700)
        await pg.screenshot(path=O+'90_mapdone.png',full_page=True)
        await pg.evaluate("__trilha.go('guide')"); await pg.wait_for_timeout(400)
        await pg.screenshot(path=O+'91_guide.png',full_page=True)
        await pg.evaluate("__trilha.go('cert')"); await pg.wait_for_timeout(400)
        await pg.screenshot(path=O+'92_cert.png',full_page=True)
        print('done',await pg.evaluate("Object.keys(__trilha.P().done).length"),'errors',errs)
        m=await b.new_page(viewport={'width':390,'height':844}); m.on('pageerror',lambda e: errs.append(str(e)))
        await m.goto('file://'+T); await m.wait_for_timeout(300)
        await m.evaluate('__trilha.startMission(7)'); await m.evaluate("__trilha.go('watch')"); await m.wait_for_timeout(1200)
        await m.screenshot(path=O+'m7_watch.png',full_page=True)
        await m.evaluate('__trilha.startMission(1)'); await m.evaluate("__trilha.go('game')"); await m.wait_for_timeout(600)
        await m.screenshot(path=O+'m1_game.png',full_page=True)
        print('mobile sw',await m.evaluate('document.documentElement.scrollWidth'),errs)
        await b.close()
asyncio.run(main())
