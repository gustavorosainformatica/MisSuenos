import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverPrecoItem } from '../lib/calculos_erp.js';
import * as db from '../lib/db.js';
import handlerProdutos from '../api/produtos.js';
import handlerClientes from '../api/clientes.js';
import handlerPedidos from '../api/pedidos.js';

function criarMockRes() {
  let statusCode = 200;
  let responseData = null;
  const headers = {};
  return {
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    writeHead(code, hdrs = {}) {
      statusCode = code;
      Object.assign(headers, hdrs);
      return this;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    end(data) {
      if (data) {
        try {
          responseData = JSON.parse(data);
        } catch {
          responseData = data;
        }
      }
      return this;
    },
    getStatusCode() { return statusCode; },
    getData() { return responseData; }
  };
}

// =========================================================================
// TESTES UNITÁRIOS DO MOTOR HÍBRIDO (TICKET 03)
// =========================================================================

test('TDD TABELAS PREÇO 01: Cliente de atacado recebe preço de atacado mesmo para 1 unidade', () => {
  const produto = {
    nome: 'PELE CAPRINA NATURAL',
    preco_venda: 115.00,
    preco_atacado: 95.00,
    qtd_minima_atacado: 5.0
  };
  const cliente = {
    nome: 'DISTRIBUIDORA GAÚCHA LTDA',
    tabela_preco: 'ATACADO'
  };

  const resultado = resolverPrecoItem({ produto, cliente, qtd: 1 });

  assert.strictEqual(resultado.precoUnitario, 95.00, 'Preço unitário deve ser o de atacado');
  assert.strictEqual(resultado.tabelaAplicada, 'ATACADO');
  assert.strictEqual(resultado.fallbackUsado, false);
  assert.strictEqual(resultado.subtotal, 95.00);
});

test('TDD TABELAS PREÇO 02: Cliente de varejo atingindo quantidade mínima converte automaticamente para atacado', () => {
  const produto = {
    nome: 'PASSADOR DE COURO TRANÇADO',
    preco_venda: 25.00,
    preco_atacado: 19.50,
    qtd_minima_atacado: 5.0
  };
  const cliente = {
    nome: 'CLIENTE VAREJO EXEMPLO',
    tabela_preco: 'VAREJO'
  };

  const resultado = resolverPrecoItem({ produto, cliente, tabelaPedido: 'VAREJO', qtd: 5 });

  assert.strictEqual(resultado.precoUnitario, 19.50, 'Atingindo 5 unidades deve converter para atacado');
  assert.strictEqual(resultado.tabelaAplicada, 'ATACADO');
  assert.strictEqual(resultado.fallbackUsado, false);
  assert.strictEqual(resultado.subtotal, 97.50);
  assert.strictEqual(resultado.gatilho, 'QUANTIDADE');
});

test('TDD TABELAS PREÇO 03: Cliente de varejo com quantidade abaixo da mínima mantém preço de varejo', () => {
  const produto = {
    nome: 'PASSADOR DE COURO TRANÇADO',
    preco_venda: 25.00,
    preco_atacado: 19.50,
    qtd_minima_atacado: 5.0
  };
  const cliente = {
    nome: 'CLIENTE VAREJO EXEMPLO',
    tabela_preco: 'VAREJO'
  };

  const resultado = resolverPrecoItem({ produto, cliente, tabelaPedido: 'VAREJO', qtd: 3 });

  assert.strictEqual(resultado.precoUnitario, 25.00, 'Abaixo da quantidade mínima mantém varejo');
  assert.strictEqual(resultado.tabelaAplicada, 'VAREJO');
  assert.strictEqual(resultado.fallbackUsado, false);
  assert.strictEqual(resultado.subtotal, 75.00);
});

test('TDD TABELAS PREÇO 04: Alternância manual no pedido força a respectiva tabela', () => {
  const produto = {
    nome: 'CABRESTO TRANÇADO',
    preco_venda: 80.00,
    preco_atacado: 62.00,
    qtd_minima_atacado: 5.0
  };
  const clienteVarejo = { nome: 'VAREJO', tabela_preco: 'VAREJO' };

  // Forçando ATACADO manualmente no pedido mesmo com 1 unidade
  const resForcadoAtacado = resolverPrecoItem({
    produto,
    cliente: clienteVarejo,
    tabelaPedido: 'ATACADO',
    qtd: 1
  });
  assert.strictEqual(resForcadoAtacado.precoUnitario, 62.00, 'Deve forçar preço de atacado');
  assert.strictEqual(resForcadoAtacado.tabelaAplicada, 'ATACADO');

  // Forçando VAREJO manualmente no pedido para cliente atacadista (com 1 unidade)
  const clienteAtacado = { nome: 'ATACADO', tabela_preco: 'ATACADO' };
  const resForcadoVarejo = resolverPrecoItem({
    produto,
    cliente: clienteAtacado,
    tabelaPedido: 'VAREJO',
    qtd: 1
  });
  assert.strictEqual(resForcadoVarejo.precoUnitario, 80.00, 'Deve forçar preço de varejo se pedido forçado para varejo');
  assert.strictEqual(resForcadoVarejo.tabelaAplicada, 'VAREJO');
});

test('TDD TABELAS PREÇO 05: Produto sem preço de atacado faz fallback seguro para varejo (Blindagem Zero Preço Zero)', () => {
  const produtoSemAtacado = {
    nome: 'ITEM ARTESANAL EXCLUSIVO',
    preco_venda: 150.00,
    preco_atacado: null,
    qtd_minima_atacado: 5.0
  };
  const clienteAtacado = { nome: 'ATACADISTA', tabela_preco: 'ATACADO' };

  const resultado = resolverPrecoItem({
    produto: produtoSemAtacado,
    cliente: clienteAtacado,
    tabelaPedido: 'ATACADO',
    qtd: 10
  });

  assert.strictEqual(resultado.precoUnitario, 150.00, 'Deve usar preco_venda como fallback');
  assert.strictEqual(resultado.tabelaAplicada, 'ATACADO_FALLBACK');
  assert.strictEqual(resultado.fallbackUsado, true, 'Deve sinalizar que usou fallback');
  assert.strictEqual(resultado.subtotal, 1500.00);
});

// =========================================================================
// TESTES DE INTEGRAÇÃO COM A API REST DE PRODUTOS E CLIENTES (TICKET 02)
// =========================================================================

test('TDD TABELAS PREÇO 06: API /api/produtos deve persistir e retornar preco_atacado e qtd_minima_atacado', async () => {
  await db.inicializarTabelas();

  const reqPost = {
    method: 'POST',
    url: '/api/produtos',
    headers: { host: 'localhost:3000' },
    body: {
      nome: 'PRODUTO TESTE ATACADO TDD',
      categoria: 'TESTES',
      unidade_medida: 'UN',
      preco_custo: 50.00,
      preco_venda: 100.00,
      preco_atacado: 75.00,
      qtd_minima_atacado: 6.0,
      estoque_atual: 50
    }
  };
  const resPost = criarMockRes();
  await handlerProdutos(reqPost, resPost);

  assert.strictEqual(resPost.getStatusCode(), 201);
  const dataPost = resPost.getData();
  assert.strictEqual(dataPost.success, true);
  const prodId = dataPost.id;

  const prodBanco = await db.get('SELECT * FROM produtos WHERE id = ?', [prodId]);
  assert.strictEqual(prodBanco.preco_atacado, 75.00);
  assert.strictEqual(prodBanco.qtd_minima_atacado, 6.0);

  // Atualização PUT
  const reqPut = {
    method: 'PUT',
    url: `/api/produtos?id=${prodId}`,
    headers: { host: 'localhost:3000' },
    query: { id: String(prodId) },
    body: {
      preco_atacado: 70.00,
      qtd_minima_atacado: 10.0
    }
  };
  const resPut = criarMockRes();
  await handlerProdutos(reqPut, resPut);

  assert.strictEqual(resPut.getStatusCode(), 200);
  const prodAtualizado = await db.get('SELECT * FROM produtos WHERE id = ?', [prodId]);
  assert.strictEqual(prodAtualizado.preco_atacado, 70.00);
  assert.strictEqual(prodAtualizado.qtd_minima_atacado, 10.0);

  // Limpeza
  await db.run('DELETE FROM produtos WHERE id = ?', [prodId]);
});

test('TDD TABELAS PREÇO 07: API /api/pedidos deve persistir e recuperar tabela_preco_aplicada e itens_detalhados', async () => {
  await db.inicializarTabelas();

  const reqPost = {
    method: 'POST',
    url: '/api/pedidos',
    headers: { host: 'localhost:3000' },
    body: {
      cliente_nome: 'SELARIA CENTRAL LTDA',
      cidade: 'SÃO BORJA',
      uf: 'RS',
      itens: '10x PASSADOR DE COURO (R$ 19,50)',
      valor_total: 195.00,
      tabela_preco_aplicada: 'ATACADO',
      itens_detalhados: [
        {
          id: 1,
          nome: 'PASSADOR DE COURO',
          qtd: 10,
          preco: 19.50,
          tabela_item: 'ATACADO',
          subtotal: 195.00
        }
      ]
    }
  };
  const resPost = criarMockRes();
  await handlerPedidos(reqPost, resPost);

  assert.strictEqual(resPost.getStatusCode(), 201);
  const dataPost = resPost.getData();
  assert.strictEqual(dataPost.success, true);
  const pedId = dataPost.id;

  const pedBanco = await db.get('SELECT * FROM pedidos WHERE id = ?', [pedId]);
  assert.strictEqual(pedBanco.tabela_preco_aplicada, 'ATACADO');
  assert.ok(pedBanco.itens_detalhados);
  const itensParsed = JSON.parse(pedBanco.itens_detalhados);
  assert.strictEqual(itensParsed.length, 1);
  assert.strictEqual(itensParsed[0].tabela_item, 'ATACADO');

  // Limpeza
  await db.run('DELETE FROM logs_auditoria WHERE referencia_id = ?', [dataPost.numero]);
  await db.run('DELETE FROM financeiro_lancamentos WHERE pedido_id = ?', [pedId]);
  await db.run('DELETE FROM pedidos WHERE id = ?', [pedId]);
});

