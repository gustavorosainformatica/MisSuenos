/**
 * Vercel Serverless Function: /api/lotes
 * Rastreabilidade por Lote e Curtume (Batch Tracking)
 * Autor: Gustavo Rosa Informática
 * Ambiente: SQLite Local / Turso Cloud
 */

import { query, get, run, execute, registrarLog } from '../lib/db.js';
import {
  alocarLotesPeps,
  validarConsumoLotes,
  gerarNumeroLotePreventivo
} from '../lib/calculos_erp.js';

function responder(res, status, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(data);
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseUrl(req) {
  return new URL(req.url, 'http://localhost');
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

/**
 * Gera um número de lote comercial com blindagem preventiva contra erros UNIQUE
 */
async function gerarProximoNumeroLote(prefixo = 'LOTE') {
  const lotes = await query("SELECT numero_lote FROM produtos_lotes WHERE numero_lote IS NOT NULL");
  let candidato = gerarNumeroLotePreventivo(lotes, prefixo);

  let tentativas = 0;
  while (tentativas < 100) {
    const existe = await get("SELECT id FROM produtos_lotes WHERE numero_lote = ?", [candidato]);
    if (!existe) break;
    tentativas++;
    const match = candidato.match(/\d+$/);
    const num = match ? parseInt(match[0], 10) + 1 : 1;
    const anoMes = new Date().toISOString().slice(0, 7);
    candidato = `#${prefixo.toUpperCase()}-${anoMes}-${String(num).padStart(4, '0')}`;
  }

  return candidato;
}

export default async function handler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return res.status(204).end();
    }
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const url = parseUrl(req);
  const pathname = url.pathname;

  try {
    // =========================================================================
    // 1. CONSULTA DE LOTES DISPONÍVEIS (/api/lotes/disponiveis)
    // =========================================================================
    if (pathname === '/api/lotes/disponiveis') {
      if (req.method === 'GET') {
        const produtoId = url.searchParams.get('produto_id');
        let sql = `
          SELECT l.*, p.nome as produto_nome, p.codigo_sku as produto_sku
          FROM produtos_lotes l
          JOIN produtos p ON p.id = l.produto_id
          WHERE l.status = 'ATIVO' AND l.quantidade_atual > 0
        `;
        const params = [];
        if (produtoId) {
          sql += ' AND l.produto_id = ?';
          params.push(parseInt(produtoId, 10));
        }
        sql += ' ORDER BY l.data_entrada ASC, l.id ASC';

        const lotes = await query(sql, params);
        return responder(res, 200, lotes);
      }
    }

    // =========================================================================
    // 2. SIMULAÇÃO / ALOCAÇÃO AUTOMÁTICA PEPS (/api/lotes/alocar-peps)
    // =========================================================================
    if (pathname === '/api/lotes/alocar-peps') {
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const produtoId = parseInt(body.produto_id, 10);
        const quantidade = parseFloat(body.quantidade) || 0;

        if (!produtoId || isNaN(produtoId)) {
          return responder(res, 400, { error: 'O produto_id é obrigatório.' });
        }
        if (quantidade <= 0) {
          return responder(res, 400, { error: 'A quantidade deve ser maior que zero.' });
        }

        const lotesDisponiveis = await query(`
          SELECT * FROM produtos_lotes
          WHERE produto_id = ? AND status = 'ATIVO' AND quantidade_atual > 0
          ORDER BY data_entrada ASC, id ASC
        `, [produtoId]);

        const resultadoPeps = alocarLotesPeps(lotesDisponiveis, quantidade);
        return responder(res, 200, resultadoPeps);
      }
    }

    // =========================================================================
    // 3. ALTERAÇÃO DE STATUS DO LOTE (/api/lotes/:id/status)
    // =========================================================================
    const matchStatus = pathname.match(/^\/api\/lotes\/(\d+)\/status$/);
    if (matchStatus) {
      if (req.method === 'POST' || req.method === 'PUT') {
        const loteId = parseInt(matchStatus[1], 10);
        const body = await parseBody(req);
        const novoStatus = String(body.status || '').toUpperCase().trim();

        if (!['ATIVO', 'BLOQUEADO', 'ESGOTADO'].includes(novoStatus)) {
          return responder(res, 400, { error: 'Status inválido. Use ATIVO, BLOQUEADO ou ESGOTADO.' });
        }

        const lote = await get("SELECT * FROM produtos_lotes WHERE id = ?", [loteId]);
        if (!lote) {
          return responder(res, 404, { error: 'Lote não encontrado.' });
        }

        await run("UPDATE produtos_lotes SET status = ? WHERE id = ?", [novoStatus, loteId]);

        await registrarLog({
          tipoAcao: 'ALTERACAO_STATUS_LOTE',
          clienteNome: 'Estoque / Lotes',
          detalhes: `Status do lote ${lote.numero_lote} alterado de ${lote.status} para ${novoStatus}.`,
          req
        }).catch(() => {});

        return responder(res, 200, {
          success: true,
          mensagem: `Status do lote ${lote.numero_lote} atualizado para ${novoStatus}.`,
          lote_id: loteId,
          status: novoStatus
        });
      }
    }

    // =========================================================================
    // 4. LISTAGEM E CRIAÇÃO DE LOTES DO PRODUTO (/api/produtos/:id/lotes ou /api/lotes?produto_id=X)
    // =========================================================================
    const matchProdLotes = pathname.match(/^\/api\/produtos\/(\d+)\/lotes$/);
    const produtoIdParam = matchProdLotes ? parseInt(matchProdLotes[1], 10) : parseInt(url.searchParams.get('produto_id') || '0', 10);

    if (matchProdLotes || (pathname === '/api/lotes' && produtoIdParam > 0)) {
      if (req.method === 'GET') {
        const produto = await get("SELECT * FROM produtos WHERE id = ?", [produtoIdParam]);
        if (!produto) {
          return responder(res, 404, { error: 'Produto não encontrado.' });
        }

        const lotes = await query(`
          SELECT * FROM produtos_lotes
          WHERE produto_id = ?
          ORDER BY data_entrada DESC, id DESC
        `, [produtoIdParam]);

        // Resumo estatístico
        const totalSaldo = lotes.reduce((acc, l) => acc + (parseFloat(l.quantidade_atual) || 0), 0);
        const ativos = lotes.filter(l => l.status === 'ATIVO' && parseFloat(l.quantidade_atual) > 0).length;

        return responder(res, 200, {
          produto: {
            id: produto.id,
            nome: produto.nome,
            codigo_sku: produto.codigo_sku,
            controla_lote: produto.controla_lote === 1,
            estoque_atual: produto.estoque_atual
          },
          estatisticas: {
            total_lotes: lotes.length,
            lotes_ativos_com_saldo: ativos,
            saldo_total_lotes: Number(totalSaldo.toFixed(4))
          },
          lotes
        });
      }

      if (req.method === 'POST') {
        const body = await parseBody(req);
        const produto = await get("SELECT * FROM produtos WHERE id = ?", [produtoIdParam]);
        if (!produto) {
          return responder(res, 404, { error: 'Produto não encontrado.' });
        }

        const qtdInicial = parseFloat(body.quantidade_inicial !== undefined ? body.quantidade_inicial : body.quantidade);
        if (isNaN(qtdInicial) || qtdInicial <= 0) {
          return responder(res, 400, { error: 'A quantidade inicial do lote deve ser maior que zero.' });
        }

        // Blindagem preventiva do número do lote
        let numLote = body.numero_lote ? String(body.numero_lote).toUpperCase().trim() : '';
        if (!numLote) {
          numLote = await gerarProximoNumeroLote('LOTE');
        } else {
          // Checar se já existe para este produto
          const existe = await get("SELECT id FROM produtos_lotes WHERE produto_id = ? AND numero_lote = ?", [produtoIdParam, numLote]);
          if (existe) {
            return responder(res, 400, { error: `O lote ${numLote} já está cadastrado para este produto.` });
          }
        }

        const dataEntrada = body.data_entrada ? String(body.data_entrada).slice(0, 10) : new Date().toISOString().slice(0, 10);
        const curtumeOrigem = body.curtume_origem ? String(body.curtume_origem).toUpperCase().trim() : (body.fornecedor_nome ? String(body.fornecedor_nome).toUpperCase().trim() : '');
        const tonalidade = body.tonalidade ? String(body.tonalidade).toUpperCase().trim() : '';
        const dataFabricacao = body.data_fabricacao ? String(body.data_fabricacao).slice(0, 10) : null;
        const dataValidade = body.data_validade ? String(body.data_validade).slice(0, 10) : null;
        const custoUnitario = parseFloat(body.custo_unitario !== undefined ? body.custo_unitario : produto.preco_custo) || 0;
        const observacoes = body.observacoes ? String(body.observacoes).trim() : '';

        // 1. Inserir lote
        const insertLote = await run(`
          INSERT INTO produtos_lotes (
            produto_id, numero_lote, quantidade_inicial, quantidade_atual,
            data_entrada, data_fabricacao, data_validade, curtume_origem,
            tonalidade, custo_unitario, status, observacoes, data_cadastro
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ATIVO', ?, datetime('now', 'localtime'))
        `, [
          produtoIdParam,
          numLote,
          qtdInicial,
          qtdInicial,
          dataEntrada,
          dataFabricacao,
          dataValidade,
          curtumeOrigem,
          tonalidade,
          custoUnitario,
          observacoes
        ]);

        const loteId = insertLote.lastInsertRowid;

        // 2. Se solicitado ou por padrão de entrada avulsa, atualizar estoque e Kardex
        if (body.atualizar_estoque !== false) {
          const saldoAnterior = parseFloat(produto.estoque_atual || 0);
          const saldoPosterior = Number((saldoAnterior + qtdInicial).toFixed(4));

          await run("UPDATE produtos SET estoque_atual = ?, controla_lote = 1, data_atualizacao = datetime('now', 'localtime') WHERE id = ?", [saldoPosterior, produtoIdParam]);

          await run(`
            INSERT INTO estoque_movimentacoes (
              produto_id, tipo, origem, motivo, quantidade,
              saldo_anterior, saldo_posterior, custo_unitario,
              documento_referencia, lote_id, numero_lote,
              observacoes, operador_nome, data_movimentacao
            ) VALUES (?, 'ENTRADA', 'AJUSTE_MANUAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
          `, [
            produtoIdParam,
            `CADASTRO DE LOTE ${numLote}`,
            qtdInicial,
            saldoAnterior,
            saldoPosterior,
            custoUnitario,
            numLote,
            loteId,
            numLote,
            `Entrada inicial de lote. Curtume: ${curtumeOrigem || 'N/I'} | Tonalidade: ${tonalidade || 'N/I'}. Obs: ${observacoes}`,
            body.operador_nome || 'SISTEMA'
          ]);
        }

        await registrarLog({
          tipoAcao: 'CRIACAO_LOTE',
          clienteNome: 'Estoque / Lotes',
          detalhes: `Novo lote ${numLote} criado para o produto ${produto.nome}. Qtd inicial: ${qtdInicial}.`,
          req
        }).catch(() => {});

        return responder(res, 201, {
          success: true,
          mensagem: `Lote ${numLote} registrado com sucesso.`,
          lote: {
            id: loteId,
            produto_id: produtoIdParam,
            numero_lote: numLote,
            quantidade_inicial: qtdInicial,
            quantidade_atual: qtdInicial,
            curtume_origem: curtumeOrigem,
            tonalidade,
            custo_unitario: custoUnitario,
            status: 'ATIVO',
            data_entrada: dataEntrada
          }
        });
      }
    }

    // 5. LISTAGEM GERAL DE LOTES (/api/lotes)
    if (pathname === '/api/lotes') {
      if (req.method === 'GET') {
        const status = url.searchParams.get('status');
        let sql = `
          SELECT l.*, p.nome as produto_nome, p.codigo_sku as produto_sku
          FROM produtos_lotes l
          JOIN produtos p ON p.id = l.produto_id
          WHERE 1=1
        `;
        const params = [];
        if (status) {
          sql += ' AND l.status = ?';
          params.push(status.toUpperCase().trim());
        }
        sql += ' ORDER BY l.id DESC LIMIT 100';

        const lotes = await query(sql, params);
        return responder(res, 200, lotes);
      }
    }

    return responder(res, 404, { error: 'Endpoint de lotes não encontrado', pathname });

  } catch (erro) {
    console.error('[ERRO API LOTES]', erro);
    return responder(res, 500, { error: 'Erro interno no módulo de lotes', detalhes: erro.message });
  }
}
