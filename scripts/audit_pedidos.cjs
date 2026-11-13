const puppeteer = require('puppeteer');
const fs = require('fs');
(async () => {
  const browser = await puppeteer.launch({headless: true, args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.goto('https://missuenos.vercel.app/', {waitUntil:'networkidle2'});
  await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('a')).find(a => a.textContent.includes('Pedidos de Venda'));
  if (el) el.click();
});
await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({path: 'pedidos_view.png', fullPage:true});
  const snapshot = await page.accessibility.snapshot();
  fs.writeFileSync('accessibility_snapshot.json', JSON.stringify(snapshot, null, 2));
  await browser.close();
})();
