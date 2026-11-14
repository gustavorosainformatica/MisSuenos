import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import handlerProdutos from '../api/produtos.js';
import { query, run } from '../lib/db.js';

test('Gestão Integrada de Categorias (Opção 3: Combobox + Central de Gestão)', async (t) => {
  const htmlPath = path.resolve('public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  await t.test('1. Ficha do Produto: deve conter o campo Combobox editável e dropdown de categorias', () => {
    assert.ok(html.includes('id="form-prod-cat"'), 'Deve conter input com id="form-prod-cat"');
    assert.ok(html.includes('id="dropdown-cat-produto"'), 'Deve conter dropdown flutuante com id="dropdown-cat-produto"');
    assert.ok(html.includes('id="dropdown-cat-produto-criar"'), 'Deve conter container para criação de nova categoria');
    assert.ok(html.includes('onclick="criarCategoriaNoDropdown()"'), 'Deve conter botão de criar nova categoria no dropdown');
    assert.ok(html.includes('onclick="abrirModalGestaoCategorias()"'), 'Deve conter botão ⚙️ para abrir a Central de Gestão');
  });

  await t.test('2. Central de Gestão: deve conter o modal dedicado #modal-gestao-categorias', () => {
    assert.ok(html.includes('id="modal-gestao-categorias"'), 'Deve conter modal com id="modal-gestao-categorias"');
    assert.ok(html.includes('id="form-nova-cat-nome"'), 'Deve conter campo para nome da nova categoria');
    assert.ok(html.includes('id="form-nova-cat-cor"'), 'Deve conter seletor de cor/badge');
    assert.ok(html.includes('id="form-nova-cat-icone"'), 'Deve conter campo de ícone/emoji');
    assert.ok(html.includes('id="tbody-gestao-categorias"'), 'Deve conter corpo da tabela de categorias');
    assert.ok(html.includes('onclick="salvarNovaCategoriaModal()"'), 'Deve conter ação de cadastrar nova categoria no modal');
  });

  await t.test('3. KPI no Topo: Card de Categorias Ativas deve permitir abrir a Central de Gestão', () => {
    assert.ok(html.includes('id="card-kpi-prod-categorias"'), 'Deve conter card de KPI de categorias');
    assert.ok(html.includes('onclick="abrirModalGestaoCategorias()"'), 'Clique no card deve chamar abrirModalGestaoCategorias');
  });

  await t.test('4. Funções JS: deve conter os controladores reativos de categorias', () => {
    assert.ok(html.includes('function obterCategoriasComContagem'), 'Deve implementar obterCategoriasComContagem');
    assert.ok(html.includes('function abrirDropdownCategoriaProduto'), 'Deve implementar abrirDropdownCategoriaProduto');
    assert.ok(html.includes('function filtrarDropdownCategoriaProduto'), 'Deve implementar filtrarDropdownCategoriaProduto');
    assert.ok(html.includes('function selecionarCategoriaProduto'), 'Deve implementar selecionarCategoriaProduto');
    assert.ok(html.includes('function criarCategoriaNoDropdown'), 'Deve implementar criarCategoriaNoDropdown');
    assert.ok(html.includes('function abrirModalGestaoCategorias'), 'Deve implementar abrirModalGestaoCategorias');
    assert.ok(html.includes('function salvarNovaCategoriaModal'), 'Deve implementar salvarNovaCategoriaModal');
    assert.ok(html.includes('function renomearCategoriaModal'), 'Deve implementar renomearCategoriaModal');
    assert.ok(html.includes('function excluirCategoriaModal'), 'Deve implementar excluirCategoriaModal');
  });

  await t.test('5. API Backend: GET /api/produtos/categorias deve listar categorias agrupadas', async () => {
    // Garante ao menos 1 produto cadastrado para o teste
    const skuTemp = `SKU-TEST-GET-CAT-${Date.now()}`;
    const agora = new Date().toISOString();
    await run(`
      INSERT INTO produtos (codigo_sku, nome, categoria, unidade_medida, ncm, preco_custo, preco_venda, estoque_atual, ativo, data_cadastro)
      VALUES (?, 'PRODUTO TESTE GET CAT', 'CAT_GET_TESTE', 'UN', '42050000', 10, 20, 5, 1, ?)
    `, [skuTemp, agora]);

    let statusCode = null;
    let headers = {};
    let responseBody = null;

    const req = {
      method: 'GET',
      url: '/api/produtos/categorias',
      headers: {}
    };

    const res = {
      writeHead(code, h) { statusCode = code; headers = h; },
      status(code) { statusCode = code; return this; },
      json(data) { responseBody = data; return this; },
      end(data) { if (data && !responseBody) responseBody = JSON.parse(data); }
    };

    await handlerProdutos(req, res);
    assert.equal(statusCode, 200, 'Status deve ser 200');
    assert.ok(Array.isArray(responseBody), 'Resposta deve ser um array de categorias');
    assert.ok(responseBody.length > 0, 'Deve conter categorias');
    assert.ok('categoria' in responseBody[0], 'Item deve possuir chave categoria');
    assert.ok('total' in responseBody[0], 'Item deve possuir chave total');

    // Limpeza
    await run('DELETE FROM produtos WHERE codigo_sku = ?', [skuTemp]);
  });

  await t.test('6. API Backend: POST /api/produtos/renomear-categoria deve atualizar produtos no banco', async () => {
    // Insere produto temporário de teste
    const skuTemp = `SKU-TEST-CAT-${Date.now()}`;
    const agora = new Date().toISOString();
    await run(`
      INSERT INTO produtos (codigo_sku, nome, categoria, unidade_medida, ncm, preco_custo, preco_venda, estoque_atual, ativo, data_cadastro)
      VALUES (?, 'PRODUTO TESTE CAT', 'CAT_ORIGINAL', 'UN', '42050000', 10, 20, 5, 1, ?)
    `, [skuTemp, agora]);

    let statusCode = null;
    let responseBody = null;

    const req = {
      method: 'POST',
      url: '/api/produtos/renomear-categoria',
      body: {
        nomeAntigo: 'CAT_ORIGINAL',
        novoNome: 'CAT_MODIFICADA'
      }
    };

    const res = {
      status(code) { statusCode = code; return this; },
      json(data) { responseBody = data; return this; },
      writeHead(code) { statusCode = code; },
      end(data) { if (data && !responseBody) responseBody = JSON.parse(data); }
    };

    await handlerProdutos(req, res);
    assert.equal(statusCode, 200, 'Status deve ser 200');
    assert.ok(responseBody.success, 'Deve retornar success: true');
    assert.ok(responseBody.changes >= 1, 'Deve ter atualizado pelo menos 1 produto');

    // Verifica no banco de dados se a categoria foi atualizada
    const rows = await query('SELECT categoria FROM produtos WHERE codigo_sku = ?', [skuTemp]);
    assert.equal(rows[0].categoria, 'CAT_MODIFICADA', 'Categoria no banco deve ter sido alterada');

    // Limpeza do teste
    await run('DELETE FROM produtos WHERE codigo_sku = ?', [skuTemp]);
  });
});
