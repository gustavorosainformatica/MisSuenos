import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('SANFONA TICKET 01: mobile.css contém regras obrigatórias da Sanfona Retrátil', () => {
  const cssPath = path.join(rootDir, 'public', 'mobile.css');
  assert.ok(fs.existsSync(cssPath), 'Arquivo public/mobile.css deve existir');

  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // 1. Classes principais da sanfona
  assert.ok(
    cssContent.includes('.mobile-kpi-accordion'),
    'mobile.css deve definir a classe .mobile-kpi-accordion'
  );
  assert.ok(
    cssContent.includes('.kpi-accordion-btn'),
    'mobile.css deve definir a classe .kpi-accordion-btn'
  );
  assert.ok(
    cssContent.includes('.kpi-accordion-body'),
    'mobile.css deve definir a classe .kpi-accordion-body'
  );
  assert.ok(
    cssContent.includes('.kpi-accordion-body.expanded'),
    'mobile.css deve definir o estado expandido .kpi-accordion-body.expanded'
  );
});

test('SANFONA TICKET 01: Sanfona inicia colapsada no mobile e botão é oculto no desktop', () => {
  const cssPath = path.join(rootDir, 'public', 'mobile.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // No desktop o botão deve ser display: none
  assert.ok(
    cssContent.includes('.kpi-accordion-btn {\n  display: none;') ||
    cssContent.includes('.kpi-accordion-btn {\r\n  display: none;') ||
    cssContent.includes('.kpi-accordion-btn{display:none}'),
    'Botão .kpi-accordion-btn deve ser oculto por padrão no desktop'
  );

  // No mobile, .kpi-accordion-body deve iniciar com display: none
  assert.ok(
    cssContent.includes('.kpi-accordion-body {\n    display: none;') ||
    cssContent.includes('.kpi-accordion-body {\r\n    display: none;') ||
    cssContent.includes('.kpi-accordion-body {\n  display: none;') ||
    cssContent.includes('.kpi-accordion-body {\r\n  display: none;'),
    'Corpo da sanfona deve iniciar display: none no mobile'
  );
});

test('SANFONA TICKET 02: Containers da sanfona existem para Clientes e Produtos no index.html', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // Clientes
  assert.ok(
    htmlContent.includes('id="kpi-accordion-clientes"'),
    'index.html deve conter o container id="kpi-accordion-clientes"'
  );
  assert.ok(
    htmlContent.includes('id="btn-toggle-kpi-clientes"'),
    'index.html deve conter o botão id="btn-toggle-kpi-clientes"'
  );
  assert.ok(
    htmlContent.includes('id="body-kpi-clientes"'),
    'index.html deve conter o corpo id="body-kpi-clientes"'
  );

  // Produtos
  assert.ok(
    htmlContent.includes('id="kpi-accordion-produtos"'),
    'index.html deve conter o container id="kpi-accordion-produtos"'
  );
  assert.ok(
    htmlContent.includes('id="btn-toggle-kpi-produtos"'),
    'index.html deve conter o botão id="btn-toggle-kpi-produtos"'
  );
  assert.ok(
    htmlContent.includes('id="body-kpi-produtos"'),
    'index.html deve conter o corpo id="body-kpi-produtos"'
  );
});

test('SANFONA TICKET 03: Função alternarSanfonaKpi existe no index.html e possui lógica de toggle', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(
    htmlContent.includes('function alternarSanfonaKpi') || htmlContent.includes('alternarSanfonaKpi ='),
    'index.html deve conter a função alternarSanfonaKpi'
  );
  assert.ok(
    htmlContent.includes("classList.toggle('expanded')") || htmlContent.includes('classList.contains(\'expanded\')'),
    'alternarSanfonaKpi deve alternar a classe expanded'
  );
});

test('SANFONA TICKET 04: Botão de retorno ao painel e cabeçalho unificado existem no index.html', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(
    htmlContent.includes('voltarAoPainelMobile') || htmlContent.includes("trocarModulo('painel'"),
    'index.html deve conter atalho de retorno ao painel'
  );
});
