import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularCustoProducaoBom, validarSaldoInsumos } from '../lib/calculos_erp.js';
import * as db from '../lib/db.js';
import handlerProducao from '../api/producao.js';

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

function gerarSkuTeste(prefixo = 'SKU') {
  return `${prefixo}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

// =========================================================================
// TESTES DO MOTOR DE CÁLCULO E VALIDAÇÃO (TICKET 03)
// =========================================================================

test('TDD BOM 01: Cálculo de custo teórico da Ficha Técnica (insumos + mão de obra)', () => {
  const itens = [
    { nome: 'MEIO COURO CRU SINTÉTICO', quantidade: 0.5, preco_custo: 120.00 }, // R$ 60,00
    { nome: 'FIVELA DE INOX 32MM', quantidade: 4, preco_custo: 5.50 },          // R$ 22,00
    { nome: 'ARGOLA DE INOX 40MM', quantidade: 2, preco_custo: 4.00 }           // R$ 8,00
  ];
  const custoAdicional = 25.00; // R$ 25,00 de mão de obra/costura

  const resultado = calcularCustoProducaoBom({ itens, custoAdicional });
  assert.equal(resultado.custoInsumos, 90.00);
  assert.equal(resultado.custoAdicional, 25.00);
  assert.equal(resultado.custoTotal, 115.00);
});

test('TDD BOM 02: Validação de estoque de insumos com bloqueio estrito quando faltar insumo', () => {
  const itensBom = [
    { produto_filho_id: 101, nome: 'COURO CRU', quantidade: 1.0, estoque_atual: 10 },
    { produto_filho_id: 102, nome: 'FIVELA INOX', quantidade: 4.0, estoque_atual: 15 } // precisa de 20 para produzir 5 acabados
  ];

  const validacao = validarSaldoInsumos({
    itensBom,
    qtdProduzir: 5,
    permitirSaldoNegativo: false
  });

  assert.equal(validacao.podeProduzir, false);
  assert.equal(validacao.saldoInsuficiente, true);
  assert.equal(validacao.itensFaltantes.length, 1);
  assert.equal(validacao.itensFaltantes[0].produto_filho_id, 102);
  assert.equal(validacao.itensFaltantes[0].necessario, 20);
  assert.equal(validacao.itensFaltantes[0].disponivel, 15);
  assert.equal(validacao.itensFaltantes[0].falta, 5);
});

test('TDD BOM 03: Validação de estoque permitindo produção se política de saldo negativo estiver ativa', () => {
  const itensBom = [
    { produto_filho_id: 101, nome: 'COURO CRU', quantidade: 1.0, estoque_atual: 2 }, // falta para 5
    { produto_filho_id: 102, nome: 'FIVELA INOX', quantidade: 4.0, estoque_atual: 0 } // falta para 5
  ];

  const validacao = validarSaldoInsumos({
    itensBom,
    qtdProduzir: 5,
    permitirSaldoNegativo: true // Autorizado pelo administrador
  });

  assert.equal(validacao.podeProduzir, true);
  assert.equal(validacao.saldoInsuficiente, true);
  assert.equal(validacao.itensFaltantes.length, 2);
});

// =========================================================================
// TESTES DE INTEGRAÇÃO COM BANCO E API REST
// =========================================================================

test('TDD BOM 04: API REST - Salvar e Consultar Ficha Técnica (BOM) em /api/produtos/:id/bom', async () => {
  // 1. Criar insumos sintéticos e produto acabado com SKUs únicos
  const skuInsumoA = gerarSkuTeste('INS-A');
  const skuInsumoB = gerarSkuTeste('INS-B');
  const skuAcabado = gerarSkuTeste('ACAB');

  const insumoA = await db.run(`
    INSERT INTO produtos (codigo_sku, nome, categoria, preco_custo, preco_venda, estoque_atual, data_cadastro)
    VALUES (?, 'INSUMO TESTE COURO SINTETICO', 'Insumos', 50.00, 70.00, 100, datetime('now'))
  `, [skuInsumoA]);
  const insumoB = await db.run(`
    INSERT INTO produtos (codigo_sku, nome, categoria, preco_custo, preco_venda, estoque_atual, data_cadastro)
    VALUES (?, 'INSUMO TESTE FIVELA SINTETICA', 'Insumos', 5.00, 10.00, 100, datetime('now'))
  `, [skuInsumoB]);
  const prodAcabado = await db.run(`
    INSERT INTO produtos (codigo_sku, nome, categoria, preco_custo, preco_venda, estoque_atual, data_cadastro)
    VALUES (?, 'CABRESTO CAMPEIRO SINTETICO', 'Arreios', 0, 150.00, 0, datetime('now'))
  `, [skuAcabado]);

  const prodId = prodAcabado.lastInsertRowid;
  const insumoAId = insumoA.lastInsertRowid;
  const insumoBId = insumoB.lastInsertRowid;

  // 2. Salvar Ficha Técnica (POST)
  const reqPost = {
    method: 'POST',
    url: `/api/produtos/${prodId}/bom`,
    body: {
      custo_adicional_producao: 20.00,
      itens: [
        { produto_filho_id: insumoAId, quantidade: 1.0, observacoes: 'Tiras de 25mm' },
        { produto_filho_id: insumoBId, quantidade: 2.0, observacoes: 'Passadores frontais' }
      ]
    }
  };
  const resPost = criarMockRes();
  await handlerProducao(reqPost, resPost);

  assert.equal(resPost.getStatusCode(), 200);
  const dataPost = resPost.getData();
  assert.equal(dataPost.success, true);
  assert.equal(dataPost.total_itens, 2);
  assert.equal(dataPost.custo_insumos_total, 60.00); // (1 * 50) + (2 * 5) = 60
  assert.equal(dataPost.custo_adicional_producao, 20.00);
  assert.equal(dataPost.custo_producao_estimado, 80.00); // 60 + 20

  // 3. Consultar Ficha Técnica (GET)
  const reqGet = {
    method: 'GET',
    url: `/api/produtos/${prodId}/bom`
  };
  const resGet = criarMockRes();
  await handlerProducao(reqGet, resGet);

  assert.equal(resGet.getStatusCode(), 200);
  const dataGet = resGet.getData();
  assert.equal(dataGet.produto_id, prodId);
  assert.equal(dataGet.itens.length, 2);
  assert.equal(dataGet.custo_producao_estimado, 80.00);
});

test('TDD BOM 05: Execução de Montagem Rápida em 1 Clique com baixa de insumos e entrada no Kardex', async () => {
  // 1. Criar insumo com estoque conhecido e produto acabado
  const skuInsumo = gerarSkuTeste('INS-KARDEX');
  const skuAcabado = gerarSkuTeste('ACAB-KARDEX');

  const insumo = await db.run(`
    INSERT INTO produtos (codigo_sku, nome, categoria, preco_custo, preco_venda, estoque_atual, data_cadastro)
    VALUES (?, 'INSUMO TESTE KARDEX', 'Insumos', 30.00, 45.00, 20, datetime('now'))
  `, [skuInsumo]);
  const acabado = await db.run(`
    INSERT INTO produtos (codigo_sku, nome, categoria, preco_custo, preco_venda, estoque_atual, custo_adicional_producao, data_cadastro)
    VALUES (?, 'PRODUTO ACABADO TESTE KARDEX', 'Acabados', 0, 100.00, 5, 10.00, datetime('now'))
  `, [skuAcabado]);

  const insumoId = insumo.lastInsertRowid;
  const acabadoId = acabado.lastInsertRowid;

  // Vincular na BOM (1 acabado consome 2 insumos)
  await db.run(`
    INSERT INTO produtos_bom (produto_pai_id, produto_filho_id, quantidade, data_cadastro)
    VALUES (?, ?, 2.0, datetime('now'))
  `, [acabadoId, insumoId]);

  // 2. Executar Produção de 3 unidades
  // Deve consumir 6 insumos (saldo vai de 20 para 14) e entrar 3 acabados (saldo vai de 5 para 8)
  const reqProd = {
    method: 'POST',
    url: '/api/producao/ordens',
    body: {
      produto_id: acabadoId,
      quantidade: 3,
      operador_nome: 'OPERADOR TESTE',
      observacoes: 'Produção rápida de lote teste'
    }
  };
  const resProd = criarMockRes();
  await handlerProducao(reqProd, resProd);

  assert.equal(resProd.getStatusCode(), 201);
  const dataProd = resProd.getData();
  assert.equal(dataProd.success, true);
  assert.ok(dataProd.numero.startsWith('#OP-'));
  assert.equal(dataProd.quantidade, 3);
  // Custo insumos = 3 * (2 * 30) = 180. Custo adicional = 3 * 10 = 30. Custo total = 210. Custo unitário = 70.
  assert.equal(dataProd.custo_insumos, 180.00);
  assert.equal(dataProd.custo_adicional, 30.00);
  assert.equal(dataProd.custo_total, 210.00);
  assert.equal(dataProd.custo_unitario_final, 70.00);

  // 3. Verificar saldos em produtos
  const insumoAtualizado = await db.get("SELECT estoque_atual FROM produtos WHERE id = ?", [insumoId]);
  const acabadoAtualizado = await db.get("SELECT estoque_atual, preco_custo FROM produtos WHERE id = ?", [acabadoId]);

  assert.equal(insumoAtualizado.estoque_atual, 14); // 20 - 6
  assert.equal(acabadoAtualizado.estoque_atual, 8);  // 5 + 3
  assert.equal(acabadoAtualizado.preco_custo, 70.00);

  // 4. Verificar movimentações no Kardex
  const movsInsumo = await db.query(`
    SELECT * FROM estoque_movimentacoes 
    WHERE produto_id = ? AND documento_referencia = ? AND tipo = 'SAIDA' AND origem = 'PRODUCAO'
  `, [insumoId, dataProd.numero]);
  assert.equal(movsInsumo.length, 1);
  assert.equal(movsInsumo[0].quantidade, 6);
  assert.equal(movsInsumo[0].saldo_anterior, 20);
  assert.equal(movsInsumo[0].saldo_posterior, 14);

  const movsAcabado = await db.query(`
    SELECT * FROM estoque_movimentacoes 
    WHERE produto_id = ? AND documento_referencia = ? AND tipo = 'ENTRADA' AND origem = 'PRODUCAO'
  `, [acabadoId, dataProd.numero]);
  assert.equal(movsAcabado.length, 1);
  assert.equal(movsAcabado[0].quantidade, 3);
  assert.equal(movsAcabado[0].saldo_anterior, 5);
  assert.equal(movsAcabado[0].saldo_posterior, 8);
  assert.equal(movsAcabado[0].custo_unitario, 70.00);
});

test('TDD BOM 06: Estorno de Produção com devolução ao Kardex e bloqueio de estorno repetido', async () => {
  // 1. Criar insumo e produto acabado para montagem e estorno
  const skuInsumo = gerarSkuTeste('INS-ESTORNO');
  const skuAcabado = gerarSkuTeste('ACAB-ESTORNO');

  const insumo = await db.run(`
    INSERT INTO produtos (codigo_sku, nome, categoria, preco_custo, preco_venda, estoque_atual, data_cadastro)
    VALUES (?, 'INSUMO TESTE ESTORNO', 'Insumos', 15.00, 25.00, 50, datetime('now'))
  `, [skuInsumo]);
  const acabado = await db.run(`
    INSERT INTO produtos (codigo_sku, nome, categoria, preco_custo, preco_venda, estoque_atual, data_cadastro)
    VALUES (?, 'PRODUTO ACABADO TESTE ESTORNO', 'Acabados', 0, 80.00, 10, datetime('now'))
  `, [skuAcabado]);

  const insumoId = insumo.lastInsertRowid;
  const acabadoId = acabado.lastInsertRowid;

  // BOM: 1 acabado consome 3 insumos
  await db.run("INSERT INTO produtos_bom (produto_pai_id, produto_filho_id, quantidade, data_cadastro) VALUES (?, ?, 3.0, datetime('now'))", [acabadoId, insumoId]);

  // Montar 4 acabados (consome 12 insumos: insumo vai para 38, acabado vai para 14)
  const reqProd = {
    method: 'POST',
    url: '/api/producao/ordens',
    body: { produto_id: acabadoId, quantidade: 4, operador_nome: 'OPERADOR ESTORNO' }
  };
  const resProd = criarMockRes();
  await handlerProducao(reqProd, resProd);
  assert.equal(resProd.getStatusCode(), 201);
  const ordem = resProd.getData();

  // 2. Executar Estorno da Ordem
  const reqEstorno = {
    method: 'POST',
    url: `/api/producao/ordens/${ordem.ordem_id}/estornar`,
    body: { motivo: 'Erro na contagem de peças', operador_nome: 'GERENTE' }
  };
  const resEstorno = criarMockRes();
  await handlerProducao(reqEstorno, resEstorno);

  assert.equal(resEstorno.getStatusCode(), 200);
  const dataEstorno = resEstorno.getData();
  assert.equal(dataEstorno.success, true);
  assert.equal(dataEstorno.numero, ordem.numero);

  // 3. Verificar devolução de saldos
  const insumoRevertido = await db.get("SELECT estoque_atual FROM produtos WHERE id = ?", [insumoId]);
  const acabadoRevertido = await db.get("SELECT estoque_atual FROM produtos WHERE id = ?", [acabadoId]);

  assert.equal(insumoRevertido.estoque_atual, 50); // devolveu os 12 insumos consumidos
  assert.equal(acabadoRevertido.estoque_atual, 10); // baixou os 4 acabados montados

  // 4. Testar bloqueio de estorno duplo
  const resEstornoDuplo = criarMockRes();
  await handlerProducao(reqEstorno, resEstornoDuplo);
  assert.equal(resEstornoDuplo.getStatusCode(), 400);
  assert.ok(resEstornoDuplo.getData().error.includes('ESTORNADA'));
});

test('TDD BOM 07: Validação preventiva contra loop infinito (produto não pode ser insumo de si mesmo)', async () => {
  const skuLoop = gerarSkuTeste('PROD-LOOP');
  const prod = await db.run(`
    INSERT INTO produtos (codigo_sku, nome, categoria, preco_custo, preco_venda, estoque_atual, data_cadastro)
    VALUES (?, 'PRODUTO TESTE LOOP', 'Outros', 10, 20, 5, datetime('now'))
  `, [skuLoop]);
  const prodId = prod.lastInsertRowid;

  const reqLoop = {
    method: 'POST',
    url: `/api/produtos/${prodId}/bom`,
    body: {
      itens: [
        { produto_filho_id: prodId, quantidade: 1.0 } // tentativa de auto-referência
      ]
    }
  };
  const resLoop = criarMockRes();
  await handlerProducao(reqLoop, resLoop);

  assert.equal(resLoop.getStatusCode(), 400);
  assert.ok(resLoop.getData().error.includes('referência circular'));
});
