const fs = require('fs');
const path = 'public/index.html';
const fieldsPath = 'fields_without_label.json';
if (!fs.existsSync(fieldsPath)) {
  console.error('Arquivo fields_without_label.json não encontrado');
  process.exit(1);
}
const fields = JSON.parse(fs.readFileSync(fieldsPath,'utf8'));
let html = fs.readFileSync(path,'utf8');
fields.forEach(f => {
  const tag = f.tag.toLowerCase();
  const baseId = (f.id || f.name || f.placeholder || `campo_${Math.random().toString(36).substr(2,5)}`).replace(/\s+/g,'_').toUpperCase();
  // regex to find the element without id attribute
  const regex = new RegExp(`<${tag}([^>]*?)>`, 'gi');
  html = html.replace(regex, (match, attrs) => {
    // if already has id, skip adding duplicate
    if (/\sid\s*=/.test(attrs)) {
      // ensure aria-label exists
      if (!/aria-label/.test(attrs)) {
        return `<${tag}${attrs} aria-label="${baseId}">`;
      }
      return match;
    }
    // insert id and aria-label
    const newAttrs = `${attrs} id="${baseId}" aria-label="${baseId}"`;
    // prepend label before the element
    const label = `<label for="${baseId}" class="sr-only">${baseId}</label>`;
    return label + `<${tag}${newAttrs}>`;
  });
});
fs.writeFileSync(path, html, 'utf8');
console.log('Atualização concluída em public/index.html');

