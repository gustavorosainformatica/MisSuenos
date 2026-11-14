import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('RESIZER TICKET 01: CSS contém classes da alça divisória e guia neon col-resize', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('.th-resizer'), 'Deve conter a classe .th-resizer');
  assert.ok(html.includes('cursor: col-resize'), 'Deve conter cursor: col-resize');
  assert.ok(html.includes('is-resizing-col'), 'Deve conter a classe utilitária is-resizing-col');
  assert.ok(html.includes('#00d4ff'), 'Deve exibir linha guia neon ciano (#00d4ff)');
});

test('RESIZER TICKET 02: Injeção de resizers e blindagem anti-conflito com drag-and-drop', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('function habilitarRedimensionamentoTabela'), 'Deve existir a função habilitarRedimensionamentoTabela');
  assert.ok(html.includes('function inicializarArrasteColunasGlobal'), 'Deve existir inicializarArrasteColunasGlobal');
  assert.ok(html.includes('th-nao-arrastavel'), 'Deve ignorar colunas protegidas');
  assert.ok(html.includes('resizer.draggable = false'), 'A alça divisória não deve ser arrastável');
  assert.ok(html.includes('resizer.addEventListener(\'dragstart\''), 'Deve interceptar dragstart');
  assert.ok(html.includes('e.stopPropagation()'), 'Deve isolar a propagação de eventos do resizer');
});

test('RESIZER TICKET 03: Motor de arraste manual com clamp seguro (50px a 600px)', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('function iniciarArrasteLarguraColuna'), 'Deve existir iniciarArrasteLarguraColuna');
  assert.ok(html.includes('Math.max(50, Math.min(600'), 'Deve aplicar clamp matemático seguro entre 50px e 600px');
  assert.ok(html.includes('salvarLargurasColunasTabela'), 'Deve invocar persistência no mouseup');
});

test('RESIZER TICKET 04: Auto-Ajuste com duplo clique (Auto-Fit) e restauração de padrão', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('function autoAjustarLarguraColuna'), 'Deve existir autoAjustarLarguraColuna');
  assert.ok(html.includes('resizer.addEventListener(\'dblclick\''), 'Deve escutar evento dblclick na alça');
  assert.ok(html.includes('function restaurarLargurasPadraoTabela'), 'Deve existir restaurarLargurasPadraoTabela');
  assert.ok(html.includes('Restaurar Larguras Padrão'), 'Menu de contexto das colunas deve conter a opção de restaurar larguras');
});

test('RESIZER TICKET 05: Persistência no LocalStorage com chave dedicada por tabela', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('function salvarLargurasColunasTabela'), 'Deve existir salvarLargurasColunasTabela');
  assert.ok(html.includes('function aplicarLargurasColunasSalvas'), 'Deve existir aplicarLargurasColunasSalvas');
  assert.ok(html.includes('erp_col_widths_'), 'Deve prefixar o localStorage com erp_col_widths_');
});

test('RESIZER TICKET 06: Acoplamento global em todas as tabelas corporativas', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Verifica que inicializarArrasteColunasGlobal acopla ambos os comportamentos
  const regex = /function inicializarArrasteColunasGlobal\(\)\s*\{[\s\S]*?habilitarArrasteColunasTabela\(tabela\);[\s\S]*?habilitarRedimensionamentoTabela\(tabela\);/;
  assert.ok(regex.test(html), 'inicializarArrasteColunasGlobal deve chamar tanto arraste quanto redimensionamento');
});
