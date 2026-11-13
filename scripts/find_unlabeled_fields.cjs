const puppeteer = require('puppeteer');
const fs = require('fs');
(async () => {
  const browser = await puppeteer.launch({headless: true, args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.goto('https://missuenos.vercel.app/', {waitUntil:'networkidle2'});

  // abrir o menu "Pedidos de Venda"
  await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('a')).find(a => a.textContent.includes('Pedidos de Venda'));
  if (el) el.click();
});
  // Aguarda a view de Pedidos de Venda carregar
  await new Promise(r => setTimeout(r, 1500));

  const fields = await page.evaluate(() => {
    const list = [];
    document.querySelectorAll('input, select, textarea').forEach(el => {
      const hasLabel = el.id && document.querySelector(`label[for="${el.id}"]`);
      const hasAria = el.getAttribute('aria-label');
      if (!hasLabel && !hasAria) {
        list.push({tag: el.tagName, id: el.id, name: el.name, placeholder: el.placeholder});
      }
    });
    return list;
  });

  fs.writeFileSync('fields_without_label.json', JSON.stringify(fields, null, 2));
  await browser.close();
})();
