import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('PRODUTOS GRID TICKET 01: thead de #tabela-produtos possui as 5 colunas essenciais', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const matchTable = html.match(/<table[^>]*id="tabela-produtos"[^>]*>([\s\S]*?)<\/table>/);
  assert.ok(matchTable, 'Tabela #tabela-produtos deve existir no index.html');
  const tableContent = matchTable[1];

  assert.ok(tableContent.includes('data-col="check"'), 'Deve possuir coluna check');
  assert.ok(tableContent.includes('data-col="nome"'), 'Deve possuir coluna nome (Produto / Item)');
  assert.ok(tableContent.includes('data-col="categoria"'), 'Deve possuir coluna categoria');
  assert.ok(tableContent.includes('data-col="venda"'), 'Deve possuir coluna venda');
  assert.ok(tableContent.includes('data-col="saldos"'), 'Deve possuir coluna saldos');
});

test('PRODUTOS GRID TICKET 02: Redundâncias eliminadas do cabeçalho da tabela de produtos', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const matchThead = html.match(/<table[^>]*id="tabela-produtos"[^>]*>[\s\S]*?<thead>([\s\S]*?)<\/thead>/);
  assert.ok(matchThead, 'Thead de #tabela-produtos deve existir');
  const theadContent = matchThead[1];

  assert.ok(!theadContent.includes('data-col="acoes"'), 'Coluna acoes deve ser removida');
  assert.ok(!theadContent.includes('data-col="unidade"'), 'Coluna unidade solta deve ser removida');
  assert.ok(!theadContent.includes('data-col="ncm"'), 'Coluna ncm solta deve ser removida do grid padrão');
  assert.ok(!theadContent.includes('data-col="custo"'), 'Coluna custo solta deve ser removida do grid padrão');
  assert.ok(!theadContent.includes('data-col="sku"'), 'Coluna sku solta deve ser unificada no produto');
});

test('PRODUTOS GRID TICKET 03: renderTabelaProdutos integra SKU e formata estado vazio', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('colspan="5"'), 'Estado vazio deve usar colspan="5"');
  assert.ok(html.includes('data-col="nome"'), 'Deve renderizar td data-col="nome"');
  assert.ok(html.includes('${skuCodigo}'), 'Deve exibir o SKU integrado na célula de produto');
  assert.ok(!html.includes('Item oficial tabela fiscal Mis Sueños'), 'Texto longo repetitivo de subtítulo deve ser removido');
});

test('PRODUTOS GRID TICKET 04: Configuração ORDEM_PADRAO_TABELAS e DICIONARIO_COLUNAS_ERP atualizada', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(
    html.includes("'tabela-produtos': ['check', 'nome', 'categoria', 'venda', 'saldos']"),
    "ORDEM_PADRAO_TABELAS['tabela-produtos'] deve conter exatamente as 5 colunas essenciais"
  );
});

test('PRODUTOS GRID TICKET 05: Sanitização de cache do navegador em aplicarOrdemColunasSalva', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(
    html.includes("tabela.id === 'tabela-produtos'"),
    'aplicarOrdemColunasSalva deve possuir sanitizador dedicado para tabela-produtos'
  );
  assert.ok(
    html.includes("localStorage.removeItem('erp_col_order_tabela-produtos')"),
    'Sanitizador deve limpar ordem legada de tabela-produtos'
  );
});
