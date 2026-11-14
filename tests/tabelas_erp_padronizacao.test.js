import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('TABELAS ERP PADRONIZAÇÃO 01: #tabela-financeiro possui 5 colunas essenciais e zero redundâncias', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const matchTable = html.match(/<table[^>]*id="tabela-financeiro"[^>]*>([\s\S]*?)<\/table>/);
  assert.ok(matchTable, 'Tabela #tabela-financeiro deve existir no index.html');
  const tableContent = matchTable[1];

  assert.ok(tableContent.includes('data-col="descricao"'), 'Deve possuir coluna descricao (Lançamento & Pessoa)');
  assert.ok(tableContent.includes('data-col="categoria"'), 'Deve possuir coluna categoria');
  assert.ok(tableContent.includes('data-col="vencimento"'), 'Deve possuir coluna vencimento');
  assert.ok(tableContent.includes('data-col="valor"'), 'Deve possuir coluna valor');
  assert.ok(tableContent.includes('data-col="situacao"'), 'Deve possuir coluna situacao');

  const matchThead = tableContent.match(/<thead>([\s\S]*?)<\/thead>/);
  assert.ok(matchThead, 'Thead deve existir');
  const thead = matchThead[1];
  assert.ok(!thead.includes('data-col="acoes"'), 'Coluna acoes deve ser removida do thead');
  assert.ok(!thead.includes('data-col="tipo"'), 'Coluna tipo separada deve ser unificada');
  assert.ok(!thead.includes('data-col="pessoa"'), 'Coluna pessoa separada deve ser unificada');
});

test('TABELAS ERP PADRONIZAÇÃO 02: #tabela-clientes possui 5 colunas essenciais com ID e Cidade/UF integrados', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const matchTable = html.match(/<table[^>]*id="tabela-clientes"[^>]*>([\s\S]*?)<\/table>/);
  assert.ok(matchTable, 'Tabela #tabela-clientes deve existir');
  const tableContent = matchTable[1];

  assert.ok(tableContent.includes('data-col="check"'), 'Deve possuir coluna check');
  assert.ok(tableContent.includes('data-col="nome"'), 'Deve possuir coluna nome');
  assert.ok(tableContent.includes('data-col="doc"'), 'Deve possuir coluna doc');
  assert.ok(tableContent.includes('data-col="cidade_uf"'), 'Deve possuir coluna cidade_uf unificada');
  assert.ok(tableContent.includes('data-col="tel"'), 'Deve possuir coluna tel');

  const matchThead = tableContent.match(/<thead>([\s\S]*?)<\/thead>/);
  assert.ok(matchThead, 'Thead deve existir');
  const thead = matchThead[1];
  assert.ok(!thead.includes('data-col="id"'), 'Coluna id isolada deve ser removida do thead');
  assert.ok(!thead.includes('data-col="cidade"'), 'Coluna cidade solta deve ser unificada em cidade_uf');
  assert.ok(!thead.includes('data-col="uf"'), 'Coluna uf solta de 2 letras deve ser unificada em cidade_uf');
});

test('TABELAS ERP PADRONIZAÇÃO 03: #tabela-fiscal possui 6 colunas essenciais com DANFE/XML contextuais', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const matchTable = html.match(/<table[^>]*id="tabela-fiscal"[^>]*>([\s\S]*?)<\/table>/);
  assert.ok(matchTable, 'Tabela #tabela-fiscal deve existir');
  const tableContent = matchTable[1];

  assert.ok(tableContent.includes('data-col="check"'), 'Deve possuir coluna check');
  assert.ok(tableContent.includes('data-col="numero"'), 'Deve possuir coluna numero');
  assert.ok(tableContent.includes('data-col="modelo"'), 'Deve possuir coluna modelo');
  assert.ok(tableContent.includes('data-col="destinatario"'), 'Deve possuir coluna destinatario');
  assert.ok(tableContent.includes('data-col="valor"'), 'Deve possuir coluna valor');
  assert.ok(tableContent.includes('data-col="situacao"'), 'Deve possuir coluna situacao');

  const matchThead = tableContent.match(/<thead>([\s\S]*?)<\/thead>/);
  assert.ok(matchThead, 'Thead deve existir');
  const thead = matchThead[1];
  assert.ok(!thead.includes('data-col="acoes"'), 'Coluna acoes de 160px deve ser removida');
  assert.ok(!thead.includes('data-col="uf"'), 'Coluna uf isolada de 2 letras deve ser unificada');
  assert.ok(!thead.includes('data-col="data"'), 'Coluna data isolada deve ser integrada no numero');
});

test('TABELAS ERP PADRONIZAÇÃO 04: ORDEM_PADRAO_TABELAS e DICIONARIO_COLUNAS_ERP sincronizados em 100%', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(
    html.includes("'tabela-clientes': ['check', 'nome', 'doc', 'cidade_uf', 'tel']"),
    'Ordem padrão de clientes deve ter 5 colunas'
  );
  assert.ok(
    html.includes("'tabela-financeiro': ['descricao', 'categoria', 'vencimento', 'valor', 'situacao']"),
    'Ordem padrão do financeiro deve ter 5 colunas'
  );
  assert.ok(
    html.includes("'tabela-produtos': ['check', 'nome', 'categoria', 'venda', 'saldos']"),
    'Ordem padrão de produtos deve ter 5 colunas'
  );
  assert.ok(
    html.includes("'tabela-fiscal': ['check', 'numero', 'modelo', 'destinatario', 'valor', 'situacao']"),
    'Ordem padrão fiscal deve ter 6 colunas'
  );
  assert.ok(
    html.includes("'tabela-pedidos': ['check', 'numero', 'data', 'cliente', 'total', 'destino', 'itens', 'status']"),
    'Ordem padrão de pedidos deve ter 8 colunas otimizadas'
  );
});

test('TABELAS ERP PADRONIZAÇÃO 05: Sanitizadores de LocalStorage cobrem todas as 5 tabelas operacionais', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes("tabela.id === 'tabela-clientes'"), 'Sanitizador para tabela-clientes');
  assert.ok(html.includes("tabela.id === 'tabela-produtos'"), 'Sanitizador para tabela-produtos');
  assert.ok(html.includes("tabela.id === 'tabela-financeiro'"), 'Sanitizador para tabela-financeiro');
  assert.ok(html.includes("tabela.id === 'tabela-fiscal'"), 'Sanitizador para tabela-fiscal');
  assert.ok(html.includes("tabela.id === 'tabela-pedidos'"), 'Sanitizador para tabela-pedidos');
});
