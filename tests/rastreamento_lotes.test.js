import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alocarLotesPeps,
  validarConsumoLotes,
  gerarNumeroLotePreventivo
} from '../lib/calculos_erp.js';
import * as db from '../lib/db.js';
import { gerarHashSenha } from '../lib/auth.js';
import { criarSessao } from '../lib/sessoes.js';
import handlerLotes from '../api/lotes.js';
import handlerProducao from '../api/producao.js';
import handlerIndex from '../api/index.js';
import fs from 'node:fs';

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

function gerarSkuTeste(prefixo = 'SKU-LOTE') {
  return `${prefixo}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

// =========================================================================
// 1. TESTES UNITÁRIOS DO MOTOR MATEMÁTICO PEPS / FIFO
// =========================================================================

test('TDD LOTE 01: Alocação PEPS com saldo suficiente em um único lote', () => {
  const lotes = [
    { id: 1, numero_lote: '#LOTE-001', data_entrada: '2026-11-01', quantidade_atual: 10, curtume_origem: 'CURTUME MODELO', tonalidade: 'PINHÃO', custo_unitario: 150 },
    { id: 2, numero_lote: '#LOTE-002', data_entrada: '2026-11-10', quantidade_atual: 20, curtume_origem: 'CURTUME MODELO', tonalidade: 'PINHÃO', custo_unitario: 160 }
  ];

  const resultado = alocarLotesPeps(lotes, 4);

  assert.equal(resultado.sucesso, true);
  assert.equal(resultado.quantidadeAtendida, 4);
  assert.equal(resultado.quantidadePendente, 0);
  assert.equal(resultado.alocacoes.length, 1);
  assert.equal(resultado.alocacoes[0].lote_id, 1);
  assert.equal(resultado.alocacoes[0].quantidade, 4);
  assert.equal(resultado.alocacoes[0].saldo_restante_lote, 6);
});

test('TDD LOTE 02: Rateio PEPS entre múltiplos lotes por ordem cronológica de entrada', () => {
  const lotes = [
    { id: 10, numero_lote: '#LOTE-NOVO', data_entrada: '2026-11-12', quantidade_atual: 15, curtume_origem: 'CURTUME SUL', tonalidade: 'HAVANA' },
    { id: 5, numero_lote: '#LOTE-ANTIGO-1', data_entrada: '2026-11-02', quantidade_atual: 3, curtume_origem: 'CURTUME NORTE', tonalidade: 'HAVANA' },
    { id: 8, numero_lote: '#LOTE-ANTIGO-2', data_entrada: '2026-11-05', quantidade_atual: 4, curtume_origem: 'CURTUME NORTE', tonalidade: 'HAVANA' }
  ];

  // Solicita 6 unidades: deve consumir 3 do #LOTE-ANTIGO-1 e 3 do #LOTE-ANTIGO-2, sem tocar no #LOTE-NOVO
  const resultado = alocarLotesPeps(lotes, 6);

  assert.equal(resultado.sucesso, true);
  assert.equal(resultado.quantidadeAtendida, 6);
  assert.equal(resultado.quantidadePendente, 0);
  assert.equal(resultado.alocacoes.length, 2);

  assert.equal(resultado.alocacoes[0].lote_id, 5);
  assert.equal(resultado.alocacoes[0].quantidade, 3);
  assert.equal(resultado.alocacoes[0].saldo_restante_lote, 0);

  assert.equal(resultado.alocacoes[1].lote_id, 8);
  assert.equal(resultado.alocacoes[1].quantidade, 3);
  assert.equal(resultado.alocacoes[1].saldo_restante_lote, 1);
});

test('TDD LOTE 03: Alocação PEPS com saldo insuficiente reporta pendência e aloca o máximo', () => {
  const lotes = [
    { id: 1, numero_lote: '#LOTE-01', data_entrada: '2026-11-01', quantidade_atual: 2, status: 'ATIVO' }
  ];

  const resultado = alocarLotesPeps(lotes, 5);

  assert.equal(resultado.sucesso, false);
  assert.equal(resultado.quantidadeAtendida, 2);
  assert.equal(resultado.quantidadePendente, 3);
  assert.equal(resultado.alocacoes.length, 1);
  assert.equal(resultado.alocacoes[0].quantidade, 2);
});

test('TDD LOTE 04: Ignora lotes com saldo zero ou status BLOQUEADO/ESGOTADO', () => {
  const lotes = [
    { id: 1, numero_lote: '#LOTE-ESGOTADO', data_entrada: '2026-10-01', quantidade_atual: 0, status: 'ESGOTADO' },
    { id: 2, numero_lote: '#LOTE-BLOQUEADO', data_entrada: '2026-10-15', quantidade_atual: 10, status: 'BLOQUEADO' },
    { id: 3, numero_lote: '#LOTE-DISPONIVEL', data_entrada: '2026-11-01', quantidade_atual: 8, status: 'ATIVO' }
  ];

  const resultado = alocarLotesPeps(lotes, 5);

  assert.equal(resultado.sucesso, true);
  assert.equal(resultado.quantidadeAtendida, 5);
  assert.equal(resultado.alocacoes.length, 1);
  assert.equal(resultado.alocacoes[0].lote_id, 3);
});

test('TDD LOTE 05: Validação de consumo manual (Override PEPS)', () => {
  const lotesBanco = [
    { id: 101, numero_lote: '#LOTE-A', quantidade_atual: 5, status: 'ATIVO' },
    { id: 102, numero_lote: '#LOTE-B', quantidade_atual: 2, status: 'BLOQUEADO' }
  ];

  // Caso 1: Sucesso
  const valValida = validarConsumoLotes([{ lote_id: 101, quantidade: 3 }], lotesBanco);
  assert.equal(valValida.valido, true);
  assert.equal(valValida.totalConsumido, 3);

  // Caso 2: Quantidade maior que o saldo
  const valSaldoInsuf = validarConsumoLotes([{ lote_id: 101, quantidade: 8 }], lotesBanco);
  assert.equal(valSaldoInsuf.valido, false);
  assert.match(valSaldoInsuf.erros[0], /Saldo insuficiente/);

  // Caso 3: Lote bloqueado
  const valBloq = validarConsumoLotes([{ lote_id: 102, quantidade: 1 }], lotesBanco);
  assert.equal(valBloq.valido, false);
  assert.match(valBloq.erros[0], /BLOQUEADO/);
});

test('TDD LOTE 06: Geração preventiva de número de lote com regex e ano-mês', () => {
  const lotesExistentes = [
    { numero_lote: '#LOTE-2026-11-0001' },
    { numero_lote: '#LOTE-2026-11-0002' },
    { numero_lote: '#LOTE-2026-10-0099' } // Mês anterior não deve influenciar o sequencial
  ];

  const dataRef = new Date('2026-11-15T12:00:00Z');
  const proximo = gerarNumeroLotePreventivo(lotesExistentes, 'LOTE', dataRef);

  assert.equal(proximo, '#LOTE-2026-11-0003');
});

// =========================================================================
// 2. TESTES DE PERSISTÊNCIA E INTEGRIDADE RELACIONAL NO BANCO
// =========================================================================

test('TDD LOTE 07: Criação de produto com flag controla_lote e lote associado no banco', async () => {
  await db.inicializarTabelas();

  const sku = gerarSkuTeste('PELE-CAPRINA');
  const prodRes = await db.run(`
    INSERT INTO produtos (codigo_sku, nome, categoria, preco_venda, controla_lote, estoque_atual, data_cadastro)
    VALUES (?, ?, 'MATERIA_PRIMA', 180.00, 1, 10, datetime('now'))
  `, [sku, 'PELE CAPRINA RÚSTICA SINTÉTICA']);

  const produtoId = prodRes.lastInsertRowid;
  assert.ok(produtoId > 0);

  const numLote = `#LOTE-${Date.now()}`;
  const loteRes = await db.run(`
    INSERT INTO produtos_lotes (
      produto_id, numero_lote, quantidade_inicial, quantidade_atual,
      data_entrada, curtume_origem, tonalidade, custo_unitario, status, data_cadastro
    ) VALUES (?, ?, 10, 10, '2026-11-15', 'CURTUME EXEMPLO LTDA', 'PINHÃO CLARO', 95.00, 'ATIVO', datetime('now'))
  `, [produtoId, numLote]);

  const loteId = loteRes.lastInsertRowid;
  assert.ok(loteId > 0);

  // Consulta e valida integridade
  const loteSalvo = await db.get(`SELECT * FROM produtos_lotes WHERE id = ?`, [loteId]);
  assert.equal(loteSalvo.produto_id, produtoId);
  assert.equal(loteSalvo.numero_lote, numLote);
  assert.equal(loteSalvo.quantidade_atual, 10);
  assert.equal(loteSalvo.tonalidade, 'PINHÃO CLARO');
  assert.equal(loteSalvo.status, 'ATIVO');
});

// =========================================================================
// 3. TESTES DE INTEGRAÇÃO DOS ENDPOINTS DA API REST (/api/lotes)
// =========================================================================

test('TDD LOTE 08: POST /api/produtos/:id/lotes cria lote, atualiza estoque e grava Kardex com lote_id', async () => {
  const sku = gerarSkuTeste('INSUMO-COURO');
  const prodRes = await db.run(`
    INSERT INTO produtos (codigo_sku, nome, categoria, preco_venda, preco_custo, estoque_atual, data_cadastro)
    VALUES (?, ?, 'MATERIA_PRIMA', 150.00, 80.00, 5, datetime('now'))
  `, [sku, 'COURO BOVINO CRU SINTÉTICO']);
  const produtoId = prodRes.lastInsertRowid;

  const req = {
    method: 'POST',
    url: `/api/produtos/${produtoId}/lotes`,
    body: {
      quantidade: 12,
      curtume_origem: 'CURTUME MINAS',
      tonalidade: 'CARAMELO NOBRE',
      custo_unitario: 85.00,
      observacoes: 'Recebido conforme NF-e sintética'
    }
  };
  const res = criarMockRes();

  await handlerLotes(req, res);

  assert.equal(res.getStatusCode(), 201);
  const data = res.getData();
  assert.equal(data.success, true);
  assert.ok(data.lote.numero_lote.startsWith('#LOTE-'));
  assert.equal(data.lote.quantidade_inicial, 12);
  assert.equal(data.lote.curtume_origem, 'CURTUME MINAS');
  assert.equal(data.lote.tonalidade, 'CARAMELO NOBRE');

  // Verifica se o produto agora tem estoque_atual = 17 e controla_lote = 1
  const prodAtualizado = await db.get("SELECT estoque_atual, controla_lote FROM produtos WHERE id = ?", [produtoId]);
  assert.equal(prodAtualizado.estoque_atual, 17);
  assert.equal(prodAtualizado.controla_lote, 1);

  // Verifica se a movimentação no Kardex tem lote_id e numero_lote
  const mov = await db.get(`
    SELECT * FROM estoque_movimentacoes 
    WHERE produto_id = ? AND motivo LIKE '%CADASTRO DE LOTE%'
    ORDER BY id DESC LIMIT 1
  `, [produtoId]);
  assert.ok(mov);
  assert.equal(mov.lote_id, data.lote.id);
  assert.equal(mov.numero_lote, data.lote.numero_lote);
});

test('TDD LOTE 09: GET /api/lotes/disponiveis e alteração de status para BLOQUEADO', async () => {
  const sku = gerarSkuTeste('PELE-TESTE-DISP');
  const prodRes = await db.run(`
    INSERT INTO produtos (codigo_sku, nome, categoria, preco_venda, preco_custo, estoque_atual, controla_lote, data_cadastro)
    VALUES (?, ?, 'MATERIA_PRIMA', 100.00, 50.00, 20, 1, datetime('now'))
  `, [sku, 'PELE SINTÉTICA PARA DISPONIBILIDADE']);
  const produtoId = prodRes.lastInsertRowid;

  // Cria 2 lotes
  const resLote1 = await db.run(`
    INSERT INTO produtos_lotes (produto_id, numero_lote, quantidade_inicial, quantidade_atual, data_entrada, status, data_cadastro)
    VALUES (?, ?, 10, 10, '2026-11-01', 'ATIVO', datetime('now'))
  `, [produtoId, `#LOTE-DISP-01-${Date.now()}`]);
  const lote1Id = resLote1.lastInsertRowid;

  const resLote2 = await db.run(`
    INSERT INTO produtos_lotes (produto_id, numero_lote, quantidade_inicial, quantidade_atual, data_entrada, status, data_cadastro)
    VALUES (?, ?, 10, 10, '2026-11-05', 'ATIVO', datetime('now'))
  `, [produtoId, `#LOTE-DISP-02-${Date.now()}`]);
  const lote2Id = resLote2.lastInsertRowid;

  // Consulta disponíveis
  const reqGet = { method: 'GET', url: `/api/lotes/disponiveis?produto_id=${produtoId}` };
  const resGet = criarMockRes();
  await handlerLotes(reqGet, resGet);
  assert.equal(resGet.getStatusCode(), 200);
  const disp = resGet.getData();
  assert.equal(disp.length, 2);

  // Bloqueia lote 1
  const reqStatus = {
    method: 'POST',
    url: `/api/lotes/${lote1Id}/status`,
    body: { status: 'BLOQUEADO' }
  };
  const resStatus = criarMockRes();
  await handlerLotes(reqStatus, resStatus);
  assert.equal(resStatus.getStatusCode(), 200);

  // Consulta novamente: deve retornar apenas o lote 2
  const resGet2 = criarMockRes();
  await handlerLotes(reqGet, resGet2);
  const disp2 = resGet2.getData();
  assert.equal(disp2.length, 1);
  assert.equal(disp2[0].id, lote2Id);
});

test('TDD LOTE 10: Produção Artesanal (PCP) consumindo insumo com controla_lote baixa saldo do lote e estorno restaura', async () => {
  // 1. Cria insumo rastreado
  const skuInsumo = gerarSkuTeste('INSUMO-RAST');
  const resInsumo = await db.run(`
    INSERT INTO produtos (codigo_sku, nome, categoria, preco_venda, preco_custo, estoque_atual, controla_lote, data_cadastro)
    VALUES (?, 'COURO CRU SELECIONADO', 'MATERIA_PRIMA', 100.00, 50.00, 20, 1, datetime('now'))
  `, [skuInsumo]);
  const insumoId = resInsumo.lastInsertRowid;

  // Cria 2 lotes de 10 unidades
  const numLoteA = `#LOTE-PCP-A-${Date.now()}`;
  const resLoteA = await db.run(`
    INSERT INTO produtos_lotes (produto_id, numero_lote, quantidade_inicial, quantidade_atual, data_entrada, status, data_cadastro)
    VALUES (?, ?, 10, 10, '2026-11-01', 'ATIVO', datetime('now'))
  `, [insumoId, numLoteA]);
  const loteAId = resLoteA.lastInsertRowid;

  const numLoteB = `#LOTE-PCP-B-${Date.now()}`;
  const resLoteB = await db.run(`
    INSERT INTO produtos_lotes (produto_id, numero_lote, quantidade_inicial, quantidade_atual, data_entrada, status, data_cadastro)
    VALUES (?, ?, 10, 10, '2026-11-05', 'ATIVO', datetime('now'))
  `, [insumoId, numLoteB]);
  const loteBId = resLoteB.lastInsertRowid;

  // 2. Cria produto acabado com BOM de 3 unidades do insumo
  const skuAcabado = gerarSkuTeste('ACABADO-RAST');
  const resAcabado = await db.run(`
    INSERT INTO produtos (codigo_sku, nome, categoria, preco_venda, preco_custo, estoque_atual, controla_lote, data_cadastro)
    VALUES (?, 'BOLSA ARTESANAL COURO RASTREADA', 'PRODUTO_ACABADO', 450.00, 150.00, 0, 1, datetime('now'))
  `, [skuAcabado]);
  const acabadoId = resAcabado.lastInsertRowid;

  await db.run(`
    INSERT INTO produtos_bom (produto_pai_id, produto_filho_id, quantidade, data_cadastro)
    VALUES (?, ?, 3, datetime('now'))
  `, [acabadoId, insumoId]);

  // 3. Monta 4 bolsas -> precisa de 4 x 3 = 12 unidades do insumo
  // PEPS: deve consumir 10 do Lote A (esgotando-o) e 2 do Lote B (ficando com 8)
  const reqOp = {
    method: 'POST',
    url: '/api/producao/ordens',
    body: {
      produto_id: acabadoId,
      quantidade: 4,
      operador_nome: 'MESTRE ARTESÃO TESTE'
    }
  };
  const resOp = criarMockRes();
  await handlerProducao(reqOp, resOp);

  assert.equal(resOp.getStatusCode(), 201);
  const dataOp = resOp.getData();
  assert.equal(dataOp.success, true);
  const ordemId = dataOp.ordem_id;

  // Verifica saldos dos lotes de insumo após a produção
  const loteAAtual = await db.get("SELECT quantidade_atual, status FROM produtos_lotes WHERE id = ?", [loteAId]);
  const loteBAtual = await db.get("SELECT quantidade_atual, status FROM produtos_lotes WHERE id = ?", [loteBId]);

  assert.equal(loteAAtual.quantidade_atual, 0);
  assert.equal(loteAAtual.status, 'ESGOTADO');
  assert.equal(loteBAtual.quantidade_atual, 8);
  assert.equal(loteBAtual.status, 'ATIVO');

  // Verifica que gerou lote para o acabamento
  const loteAcabado = await db.get("SELECT * FROM produtos_lotes WHERE produto_id = ?", [acabadoId]);
  assert.ok(loteAcabado);
  assert.equal(loteAcabado.quantidade_atual, 4);

  // 4. Executa ESTORNO da Ordem de Produção
  const reqEstorno = {
    method: 'POST',
    url: `/api/producao/ordens/${ordemId}/estornar`,
    body: {
      motivo: 'Teste automatizado de estorno de lote',
      operador_nome: 'AUDITOR TESTE'
    }
  };
  const resEstorno = criarMockRes();
  await handlerProducao(reqEstorno, resEstorno);

  assert.equal(resEstorno.getStatusCode(), 200);

  // Verifica que os lotes de insumo foram restaurados com fidelidade
  const loteARestaurado = await db.get("SELECT quantidade_atual, status FROM produtos_lotes WHERE id = ?", [loteAId]);
  const loteBRestaurado = await db.get("SELECT quantidade_atual, status FROM produtos_lotes WHERE id = ?", [loteBId]);

  assert.equal(loteARestaurado.quantidade_atual, 10);
  assert.equal(loteARestaurado.status, 'ATIVO');
  assert.equal(loteBRestaurado.quantidade_atual, 10);
  assert.equal(loteBRestaurado.status, 'ATIVO');

  // Verifica que o lote de acabamento foi estornado
  const loteAcabadoEstornado = await db.get("SELECT quantidade_atual, status FROM produtos_lotes WHERE produto_id = ?", [acabadoId]);
  assert.equal(loteAcabadoEstornado.quantidade_atual, 0);
  assert.equal(loteAcabadoEstornado.status, 'ESGOTADO');
});

// =========================================================================
// 4. TESTES DE UI, ACESSIBILIDADE E DISPATCHER VERCEL HOBBY
// =========================================================================

test('TDD LOTE 11: Interface index.html possui modal-lotes-produto, controles e atalho Escape', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');

  // Checkbox no modal-produto
  assert.ok(html.includes('id="form-prod-controla-lote"'), 'Checkbox controla_lote deve existir no modal-produto');
  assert.ok(html.includes('id="btn-prod-abrir-lotes"'), 'Botão abrir lotes deve existir no modal-produto');

  // Modal de lotes completo
  assert.ok(html.includes('id="modal-lotes-produto"'), 'Modal de lotes deve existir');
  assert.ok(html.includes('id="form-novo-lote"'), 'Formulário de novo lote deve existir');
  assert.ok(html.includes('id="tabela-lotes-produto"'), 'Tabela de lotes deve existir');
  assert.ok(html.includes('modal-lotes-card-saldo-lotes'), 'Card de saldo de lotes deve existir');

  // Funções controladoras no script
  assert.ok(html.includes('function abrirModalLotes('), 'Função abrirModalLotes deve existir');
  assert.ok(html.includes('function fecharModalLotes('), 'Função fecharModalLotes deve existir');
  assert.ok(html.includes('function salvarNovoLote('), 'Função salvarNovoLote deve existir');
  assert.ok(html.includes('function alternarStatusLote('), 'Função alternarStatusLote deve existir');

  // Atalho Escape
  assert.ok(html.includes('fecharModalLotes()'), 'fecharModalLotes deve ser acionado pelo Escape');
});

test('TDD LOTE 12: Dispatcher Central (api/index.js) roteia rotas de lotes com Vercel Hobby Compliance', async () => {
  const loginTeste = 'operador_teste_dispatch_lotes';
  await db.inicializarTabelas();
  await db.run('DELETE FROM usuarios WHERE login = ?', [loginTeste]);
  await db.run(`INSERT INTO usuarios (nome, login, senha_hash, papel, ativo, data_cadastro, permissoes)
    VALUES (?, ?, ?, 'ADMIN', 1, ?, '{}')`, ['Operador Sintético', loginTeste, gerarHashSenha('Senha Sintetica 46'), new Date().toISOString()]);
  const operador = await db.get('SELECT id FROM usuarios WHERE login = ?', [loginTeste]);
  const sessao = await criarSessao(operador.id);
  try {
    const req = {
      method: 'GET',
      url: '/api/lotes/disponiveis',
      headers: { cookie: `erp_session=${encodeURIComponent(sessao.token)}` }
    };
    const res = criarMockRes();
    await handlerIndex(req, res);
    assert.equal(res.getStatusCode(), 200);
    assert.ok(Array.isArray(res.getData()));
  } finally {
    await db.run('DELETE FROM sessoes_operadores WHERE usuario_id = ?', [operador.id]);
    await db.run('DELETE FROM usuarios WHERE id = ?', [operador.id]);
  }
});
