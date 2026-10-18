import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': 1920, 'height': 1080})
        
        # 1. Abrir trilha de almoxarifado 0001
        print("Abrindo trilha almoxarifado 0001...")
        await page.goto("http://localhost:3000/treinamentos/trilha-po-alm-0001.html")
        await page.wait_for_timeout(1000)
        has_fit = await page.evaluate("document.documentElement.classList.contains('fit')")
        scale = await page.evaluate("document.getElementById('fit').style.transform")
        print(f"ALM-0001: fit={has_fit}, transform={scale}")
        await page.screenshot(path="public/treinamentos/screenshot_alm0001_fit.png")

        # 2. Abrir trilha de almoxarifado 0003
        print("Abrindo trilha almoxarifado 0003...")
        await page.goto("http://localhost:3000/treinamentos/trilha-po-alm-0003.html")
        await page.wait_for_timeout(1000)
        has_fit3 = await page.evaluate("document.documentElement.classList.contains('fit')")
        scale3 = await page.evaluate("document.getElementById('fit').style.transform")
        print(f"ALM-0003: fit={has_fit3}, transform={scale3}")
        await page.screenshot(path="public/treinamentos/screenshot_alm0003_fit.png")

        await browser.close()
        print("Screenshots atualizados capturados!")

asyncio.run(main())
