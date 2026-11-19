import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, '../public/index.html');
const demoPath = path.resolve(__dirname, '../public/demo_personalizacao_cores.html');

test('PERSONALIZAÇÃO WINDOWS 11: 01 - Script Anti-Flicker no <head>', () => {
  const content = fs.readFileSync(indexPath, 'utf8');
  assert.ok(content.includes('missuenos_accent_color'), 'Deve ler missuenos_accent_color no head');
  assert.ok(content.includes('missuenos_transparency'), 'Deve ler missuenos_transparency no head');
  assert.ok(content.includes('--accent-color'), 'Deve injetar --accent-color no root antes de renderizar');
  assert.ok(content.includes('--accent-contrast'), 'Deve calcular e injetar --accent-contrast no head');
});

test('PERSONALIZAÇÃO WINDOWS 11: 02 - Variáveis CSS Dinâmicas no :root e [data-theme="light"]', () => {
  const content = fs.readFileSync(indexPath, 'utf8');
  assert.ok(content.includes('--accent-color: #00d4ff;'), 'Deve ter --accent-color como base');
  assert.ok(content.includes('--primary: var(--accent-color);'), 'Deve amarrar --primary a --accent-color');
  assert.ok(content.includes('--primary-hover: var(--accent-hover);'), 'Deve amarrar --primary-hover');
  assert.ok(content.includes('--primary-glow: var(--accent-glow);'), 'Deve amarrar --primary-glow');
  assert.ok(content.includes('[data-transparency="true"] .erp-topbar'), 'Deve ter regras de acrílico/blur');
  assert.ok(content.includes('input[type="checkbox"], input[type="radio"], input[type="range"]'), 'Deve acentuar controles nativos com --accent-color');
});

test('PERSONALIZAÇÃO WINDOWS 11: 03 - Modal de Configurações e Live Preview', () => {
  const content = fs.readFileSync(indexPath, 'utf8');
  assert.ok(content.includes('id="modal-personalizacao-cores"'), 'Deve conter o modal dedicado');
  assert.ok(content.includes('id="win-mini-preview"'), 'Deve conter o mini simulador de Live Preview');
  assert.ok(content.includes('id="win-mode-card-dark"'), 'Deve conter o seletor de tema escuro');
  assert.ok(content.includes('id="win-mode-card-light"'), 'Deve conter o seletor de tema claro');
  assert.ok(content.includes('id="win-mode-card-system"'), 'Deve conter o seletor de tema automático (Windows)');
  assert.ok(content.includes('id="win-toggle-transparency"'), 'Deve conter o toggle de transparência acrílica');
  assert.ok(content.includes('id="win-color-palette-grid"'), 'Deve conter a grade de paleta de cores');
  assert.ok(content.includes('id="win-custom-color-picker"'), 'Deve conter o seletor de cor livre');
});

test('PERSONALIZAÇÃO WINDOWS 11: 04 - Pontos de Entrada (Engrenagem Topbar & Módulo Configurações)', () => {
  const content = fs.readFileSync(indexPath, 'utf8');
  assert.ok(content.includes('abrirModalPersonalizacaoCores()'), 'Deve ter chamada para abrir modal');
  assert.ok(content.includes('id="gear-accent-badge"'), 'Deve ter badge dinâmico no menu da engrenagem');
  assert.ok(content.includes('id="btn-tab-cfg-cores"'), 'Deve ter aba no módulo de configurações');
});

test('PERSONALIZAÇÃO WINDOWS 11: 05 - Lógica JavaScript e Paleta com 16 Cores Oficiais', () => {
  const content = fs.readFileSync(indexPath, 'utf8');
  assert.ok(content.includes('const PALETA_CORES_WINDOWS = ['), 'Deve conter o array de cores');
  assert.ok(content.includes('Azul Windows'), 'Deve incluir Azul Windows');
  assert.ok(content.includes('Ciano Tech'), 'Deve incluir Ciano Tech');
  assert.ok(content.includes('Couro Nobre'), 'Deve incluir Couro Nobre');
  assert.ok(content.includes('function aplicarCorDestaqueWindows'), 'Deve conter função de aplicação');
  assert.ok(content.includes('function selecionarModoTemaWindows'), 'Deve conter função de seleção de tema');
  assert.ok(content.includes('function aoAlternarTransparenciaWindows'), 'Deve conter função de transparência');
  assert.ok(content.includes('function restaurarPadraoAparenciaWindows'), 'Deve conter função de restauração');
});

test('PERSONALIZAÇÃO WINDOWS 11: 06 - Cálculo Matemático de Contraste WCAG (Luminância)', () => {
  function hexParaRgbWindows(hex) {
    let c = (hex || '#00d4ff').replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function calcularContrasteTextoWindows(hex) {
    const { r, g, b } = hexParaRgbWindows(hex);
    const a = [r / 255, g / 255, b / 255].map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const lum = 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    return lum > 0.45 ? '#031422' : '#ffffff';
  }

  assert.equal(calcularContrasteTextoWindows('#00d4ff'), '#031422', 'Ciano claro deve ter texto escuro');
  assert.equal(calcularContrasteTextoWindows('#0078d4'), '#ffffff', 'Azul Windows deve ter texto branco');
  assert.equal(calcularContrasteTextoWindows('#ffffff'), '#031422', 'Branco deve ter texto escuro');
  assert.equal(calcularContrasteTextoWindows('#b45309'), '#ffffff', 'Couro deve ter texto branco');
  assert.equal(calcularContrasteTextoWindows('#ef4444'), '#ffffff', 'Vermelho deve ter texto branco');
});

test('PERSONALIZAÇÃO WINDOWS 11: 07 - Página de Demonstração Isolada (demo_personalizacao_cores.html)', () => {
  assert.ok(fs.existsSync(demoPath), 'Arquivo demo_personalizacao_cores.html deve existir');
  const demoContent = fs.readFileSync(demoPath, 'utf8');
  assert.ok(demoContent.includes('PALETA_WINDOWS'), 'Demo deve conter a paleta interativa');
  assert.ok(demoContent.includes('sim-btn-primary'), 'Demo deve conter botão simulado');
  assert.ok(demoContent.includes('sim-table'), 'Demo deve conter tabela simulada');
});
