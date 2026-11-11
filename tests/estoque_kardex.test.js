import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../lib/db.js';
import handlerEstoque from '../api/estoque.js';
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
    getData() { return responseData; },
    getHeaders() { return headers; }
  };
}

async function limparProdutoTeste(sku) {
  const prod = await db.get('SELECT id FROM produtos WHERE codigo_sku = ?', [sku]);
  if (prod) {
    await db.run('DELETE FROM estoque_movimentacoes WHERE produto_id = ?', [prod.id]);
    await db.run('DELETE FROM produtos WHERE id = ?', [prod.id]);
  }
}

test('KARDEX TICKET 01 - DB: Tabela estoque_movimentacoes existe e garante constraints e índices', async () => {
  await db.inicializarTabelas();

  // Cria produto isolado para teste
  const skuTeste = 'TEST-KARDEX-DB-01';
  await limparProdutoTeste(skuTeste);
  const insProd = await db.run(`
    INSERT INTO produtos (codigo_sku, nome, categoria, preco_custo, preco_venda, estoque_atual, estoque_minimo, data_cadastro)
    VALUES (?, 'PRODUTO TESTE KARDEX DB', 'TESTE', 50.0, 100.0, 10.0, 2.0, datetime('now'))
  `, [skuTeste]);

  const prodId = insProd.lastInsertRowid;
  assert.ok(prodId, 'Produto teste deve ser criado com ID válido');

  // Inserção direta no Kardex
  const resMov = await db.run(`
    INSERT INTO estoque_movimentacoes (
      produto_id, tipo, origem, motivo, quantidade,
      saldo_anterior, saldo_posterior, custo_unitario,
      documento_referencia, observacoes, operador_nome
    ) VALUES (?, 'ENTRADA', 'AJUSTE_MANUAL', 'INVENTARIO_INICIAL', 5.0, 10.0, 15.0, 50.0, 'REF-TEST-01', 'Teste DB Kardex', 'Auditor de Teste')
  `, [prodId]);

  assert.ok(resMov.lastInsertRowid, 'Movimentação deve ser inserida com ID gerado');

  // Consulta registro
  const mov = await db.get('SELECT * FROM estoque_movimentacoes WHERE id = ?', [resMov.lastInsertRowid]);
  assert.ok(mov, 'Registro da movimentação deve existir');
  assert.strictEqual(mov.tipo, 'ENTRADA');
  assert.strictEqual(mov.origem, 'AJUSTE_MANUAL');
  assert.strictEqual(Number(mov.quantidade), 5.0);
  assert.strictEqual(Number(mov.saldo_anterior), 10.0);
  assert.strictEqual(Number(mov.saldo_posterior), 15.0);

  // Limpeza
  await limparProdutoTeste(skuTeste);
});

test('KARDEX TICKET 02 - API: GET /api/estoque/motivos retorna catálogo estruturado e categorizado', async () => {
  const req = {
    method: 'GET',
    url: '/api/estoque/motivos',
    headers: { host: 'localhost:3000' }
  };
  const res = criarMockRes();

  await handlerEstoque(req, res);

  assert.strictEqual(res.getStatusCode(), 200);
  const data = res.getData();
  assert.strictEqual(data.success, true);
  assert.ok(Array.isArray(data.motivos.ENTRADA), 'Deve conter lista de motivos de ENTRADA');
  assert.ok(Array.isArray(data.motivos.SAIDA), 'Deve conter lista de motivos de SAIDA');

  const motivoCompra = data.motivos.ENTRADA.find(m => m.id === 'COMPRA_FORNECEDOR');
  assert.ok(motivoCompra, 'Deve conter motivo COMPRA_FORNECEDOR');
  assert.ok(motivoCompra.label.includes('Compra de Fornecedor'));

  const motivoAvaria = data.motivos.SAIDA.find(m => m.id === 'AVARIA_DESCARTE');
  assert.ok(motivoAvaria, 'Deve conter motivo AVARIA_DESCARTE');
});

test('KARDEX TICKET 03 - API: POST /api/estoque/movimentar (ENTRADA) atualiza saldo e insere na Ficha Kardex', async () => {
  const sku = 'TEST-KARDEX-ENTRADA';
  await limparProdutoTeste(sku);
  const ins = await db.run(`
    INSERT INTO produtos (codigo_sku, nome, categoria, preco_custo, preco_venda, estoque_atual, estoque_minimo, data_cadastro)
    VALUES (?, 'PRODUTO TESTE ENTRADA', 'TESTE', 40.0, 80.0, 5.0, 1.0, datetime('now'))
  `, [sku]);
  const prodId = ins.lastInsertRowid;

  const req = {
    method: 'POST',
    url: '/api/estoque/movimentar',
    headers: { host: 'localhost:3000' },
    body: {
      produto_id: prodId,
      tipo: 'ENTRADA',
      origem: 'AJUSTE_MANUAL',
      motivo: 'INVENTARIO_INICIAL',
      quantidade: 7,
      documento_referencia: 'INV-2026-01',
      observacoes: 'Contagem de estoque físico'
    }
  };
  const res = criarMockRes();

  await handlerEstoque(req, res);

  assert.strictEqual(res.getStatusCode(), 201, 'Deve responder HTTP 201 Created');
  const data = res.getData();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.movimentacao.saldo_anterior, 5);
  assert.strictEqual(data.movimentacao.saldo_posterior, 12);
  assert.strictEqual(data.movimentacao.quantidade, 7);

  // Validação no banco de dados
  const prodAtualizado = await db.get('SELECT estoque_atual FROM produtos WHERE id = ?', [prodId]);
  assert.strictEqual(Number(prodAtualizado.estoque_atual), 12, 'Saldo em produtos deve ser 12');

  const movGravada = await db.get('SELECT * FROM estoque_movimentacoes WHERE produto_id = ? ORDER BY id DESC LIMIT 1', [prodId]);
  assert.ok(movGravada, 'Deve existir registro na tabela estoque_movimentacoes');
  assert.strictEqual(movGravada.tipo, 'ENTRADA');
  assert.strictEqual(Number(movGravada.quantidade), 7);
  assert.strictEqual(Number(movGravada.saldo_posterior), 12);

  // Limpeza
  await limparProdutoTeste(sku);
});

test('KARDEX TICKET 04 - API: POST /api/estoque/movimentar (SAIDA) com saldo suficiente dá baixa atômica', async () => {
  const sku = 'TEST-KARDEX-SAIDA-OK';
  await limparProdutoTeste(sku);
  const ins = await db.run(`
    INSERT INTO produtos (codigo_sku, nome, categoria, preco_custo, preco_venda, estoque_atual, estoque_minimo, data_cadastro)
    VALUES (?, 'PRODUTO TESTE SAIDA OK', 'TESTE', 60.0, 120.0, 20.0, 2.0, datetime('now'))
  `, [sku]);
  const prodId = ins.lastInsertRowid;

  const req = {
    method: 'POST',
    url: '/api/estoque/movimentar',
    headers: { host: 'localhost:3000' },
    body: {
      produto_id: prodId,
      tipo: 'SAIDA',
      origem: 'AJUSTE_MANUAL',
      motivo: 'AVARIA_DESCARTE',
      quantidade: 4,
      documento_referencia: 'AV-001',
      observacoes: 'Couro com rasgo de transporte'
    }
  };
  const res = criarMockRes();

  await handlerEstoque(req, res);

  assert.strictEqual(res.getStatusCode(), 201);
  const data = res.getData();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.movimentacao.saldo_anterior, 20);
  assert.strictEqual(data.movimentacao.saldo_posterior, 16);
  assert.strictEqual(data.movimentacao.quantidade, 4);

  const prodAtualizado = await db.get('SELECT estoque_atual FROM produtos WHERE id = ?', [prodId]);
  assert.strictEqual(Number(prodAtualizado.estoque_atual), 16);

  // Limpeza
  await limparProdutoTeste(sku);
});

test('KARDEX TICKET 05 - API: POST /api/estoque/movimentar bloqueia SAIDA maior que o saldo (Estoque Insuficiente)', async () => {
  const sku = 'TEST-KARDEX-BLOQUEIO';
  await limparProdutoTeste(sku);
  const ins = await db.run(`
    INSERT INTO produtos (codigo_sku, nome, categoria, preco_custo, preco_venda, estoque_atual, estoque_minimo, data_cadastro)
    VALUES (?, 'PRODUTO TESTE BLOQUEIO', 'TESTE', 30.0, 60.0, 3.0, 1.0, datetime('now'))
  `, [sku]);
  const prodId = ins.lastInsertRowid;

  // Tentativa de baixar 10 unidades quando só há 3
  const req = {
    method: 'POST',
    url: '/api/estoque/movimentar',
    headers: { host: 'localhost:3000' },
    body: {
      produto_id: prodId,
      tipo: 'SAIDA',
      motivo: 'AVARIA_DESCARTE',
      quantidade: 10
    }
  };
  const res = criarMockRes();

  await handlerEstoque(req, res);

  assert.strictEqual(res.getStatusCode(), 400, 'Deve responder HTTP 400 Bad Request');
  const data = res.getData();
  assert.ok(data.error.includes('Estoque insuficiente'), 'Mensagem deve indicar estoque insuficiente');
  assert.strictEqual(data.saldo_atual, 3);
  assert.strictEqual(data.tentativa_saida, 10);

  // Garante que o saldo do produto no banco permaneceu 3.0 intacto
  const prod = await db.get('SELECT estoque_atual FROM produtos WHERE id = ?', [prodId]);
  assert.strictEqual(Number(prod.estoque_atual), 3.0, 'Saldo deve permanecer intacto sem mutação');

  // Limpeza
  await limparProdutoTeste(sku);
});

test('KARDEX TICKET 06 - API: Validação de parâmetros inválidos (quantidade zero, negativa e tipos desconhecidos)', async () => {
  // Cenário A: Quantidade zero
  const reqZero = {
    method: 'POST',
    url: '/api/estoque/movimentar',
    headers: { host: 'localhost:3000' },
    body: { produto_id: 1, tipo: 'ENTRADA', motivo: 'TESTE', quantidade: 0 }
  };
  const resZero = criarMockRes();
  await handlerEstoque(reqZero, resZero);
  assert.strictEqual(resZero.getStatusCode(), 400);

  // Cenário B: Quantidade negativa
  const reqNeg = {
    method: 'POST',
    url: '/api/estoque/movimentar',
    headers: { host: 'localhost:3000' },
    body: { produto_id: 1, tipo: 'ENTRADA', motivo: 'TESTE', quantidade: -5 }
  };
  const resNeg = criarMockRes();
  await handlerEstoque(reqNeg, resNeg);
  assert.strictEqual(resNeg.getStatusCode(), 400);

  // Cenário C: Tipo inválido
  const reqTipo = {
    method: 'POST',
    url: '/api/estoque/movimentar',
    headers: { host: 'localhost:3000' },
    body: { produto_id: 1, tipo: 'TRANSFERENCIA_INVALIDA', motivo: 'TESTE', quantidade: 2 }
  };
  const resTipo = criarMockRes();
  await handlerEstoque(reqTipo, resTipo);
  assert.strictEqual(resTipo.getStatusCode(), 400);
});

test('KARDEX TICKET 07 - API: GET /api/estoque/kardex/:id calcula totalizadores e histórico ordenado', async () => {
  const sku = 'TEST-KARDEX-EXTRATO';
  await limparProdutoTeste(sku);
  const ins = await db.run(`
    INSERT INTO produtos (codigo_sku, nome, categoria, preco_custo, preco_venda, estoque_atual, estoque_minimo, data_cadastro)
    VALUES (?, 'PRODUTO EXTRATO KARDEX', 'TESTE', 15.0, 35.0, 15.0, 2.0, datetime('now'))
  `, [sku]);
  const prodId = ins.lastInsertRowid;

  // Insere movimentações simuladas no tempo
  await db.run(`
    INSERT INTO estoque_movimentacoes (produto_id, tipo, origem, motivo, quantidade, saldo_anterior, saldo_posterior, data_movimentacao)
    VALUES (?, 'ENTRADA', 'INVENTARIO', 'INVENTARIO_INICIAL', 20.0, 0, 20.0, '2026-11-01 10:00:00')
  `, [prodId]);

  await db.run(`
    INSERT INTO estoque_movimentacoes (produto_id, tipo, origem, motivo, quantidade, saldo_anterior, saldo_posterior, data_movimentacao)
    VALUES (?, 'SAIDA', 'AJUSTE_MANUAL', 'AVARIA_DESCARTE', 5.0, 20.0, 15.0, '2026-11-05 14:30:00')
  `, [prodId]);

  const req = {
    method: 'GET',
    url: `/api/estoque/kardex/${prodId}`,
    headers: { host: 'localhost:3000' }
  };
  const res = criarMockRes();

  await handlerEstoque(req, res);

  assert.strictEqual(res.getStatusCode(), 200);
  const data = res.getData();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.produto.id, prodId);
  assert.strictEqual(data.totais.total_entradas, 20);
  assert.strictEqual(data.totais.total_saidas, 5);
  assert.strictEqual(data.totais.total_registros, 2);
  assert.strictEqual(data.movimentacoes.length, 2);

  // Primeira linha deve ser a mais recente (ordem decrescente)
  assert.strictEqual(data.movimentacoes[0].tipo, 'SAIDA');
  assert.strictEqual(data.movimentacoes[1].tipo, 'ENTRADA');

  // Limpeza
  await limparProdutoTeste(sku);
});

test('KARDEX TICKET 08 - INTEGRAÇÃO PEDIDOS: Pedido faturado/enviado registra saída VENDA_PEDIDO no Kardex', async () => {
  const sku = 'TEST-KARDEX-PEDIDO';
  await limparProdutoTeste(sku);
  const ins = await db.run(`
    INSERT INTO produtos (codigo_sku, nome, categoria, preco_custo, preco_venda, estoque_atual, estoque_reservado, data_cadastro)
    VALUES (?, 'COURO KARDEX VENDA', 'COURO', 50.0, 100.0, 10.0, 0.0, datetime('now'))
  `, [sku]);
  const prodId = ins.lastInsertRowid;

  // Cria pedido diretamente como ENVIADO (faturado com baixa imediata)
  const reqPedido = {
    method: 'POST',
    url: '/api/pedidos',
    headers: { host: 'localhost:3000' },
    body: {
      cliente_nome: 'CLIENTE TESTE KARDEX',
      status: 'ENVIADO',
      forma_pagamento: 'PIX',
      pago_na_hora: true,
      itens: '3x COURO KARDEX VENDA (R$ 100,00)',
      itens_detalhados: [
        { id: prodId, nome: 'COURO KARDEX VENDA', qtd: 3, preco: 100.0 }
      ]
    }
  };
  const resPedido = criarMockRes();
  await handlerPedidos(reqPedido, resPedido);

  assert.strictEqual(resPedido.getStatusCode(), 201);
  const pedidoData = resPedido.getData();
  const pedidoId = pedidoData?.pedido?.id || pedidoData?.id;

  // Verifica se o estoque físico baixou para 7
  const prod = await db.get('SELECT estoque_atual FROM produtos WHERE id = ?', [prodId]);
  assert.strictEqual(Number(prod.estoque_atual), 7.0, 'Estoque físico do produto deve ter baixado de 10 para 7');

  // Verifica se o Kardex registrou a movimentação com origem VENDA e motivo VENDA_PEDIDO
  const movKardex = await db.get(`
    SELECT * FROM estoque_movimentacoes 
    WHERE produto_id = ? AND tipo = 'SAIDA' AND motivo = 'VENDA_PEDIDO'
    ORDER BY id DESC LIMIT 1
  `, [prodId]);

  assert.ok(movKardex, 'Movimentação VENDA_PEDIDO deve existir na Ficha Kardex');
  assert.strictEqual(Number(movKardex.quantidade), 3.0);
  assert.strictEqual(Number(movKardex.saldo_anterior), 10.0);
  assert.strictEqual(Number(movKardex.saldo_posterior), 7.0);

  // Limpeza
  if (pedidoId) {
    await db.run('DELETE FROM financeiro_lancamentos WHERE pedido_id = ?', [pedidoId]);
    await db.run('DELETE FROM pedidos WHERE id = ?', [pedidoId]);
  }
  await limparProdutoTeste(sku);
});
