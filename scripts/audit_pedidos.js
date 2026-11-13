const puppeteer = require('puppeteer');
const fs = require('fs');
(async () => {
  const browser = await puppeteer.launch({headless: true, args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.goto('https://missuenos.vercel.app/', {waitUntil:'networkidle2'});
  // localizar item de menu "Pedidos de Venda"
  const [menu] = await page.$x("//a[contains(., 'Pedidos de Venda')]");
  if (menu) {
    await menu.click();
    await page.waitForTimeout(2000);
  } else {
    console.error('Item de menu "Pedidos de Venda" não encontrado');
    await browser.close();
    process.exit(1);
  }
  // captura de tela completa
  const screenshotPath = 'pedidos_view.png';
  await page.screenshot({path: screenshotPath, fullPage:true});
  // snapshot de acessibilidade
  const snapshot = await page.accessibility.snapshot();
  fs.writeFileSync('accessibility_snapshot.json', JSON.stringify(snapshot, null, 2));
  await browser.close();
})();
