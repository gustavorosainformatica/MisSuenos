/**
 * Vercel Serverless Function: /api/produtos
 * Suporta GET (listar/buscar), POST (criar), PUT (atualizar), DELETE (excluir)
 *Inclui suporte completo a NCM (8 dígitos) e Estoque Reservado (3 saldos: Físico, Reservado, Disponível).
 * Persistência unificada via lib/db.js (Turso Cloud ou SQLite Local)
 */

import { query, get, run, registrarLog } from '../lib/db.js';

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

function enriquecerProduto(p) {
  if (!p) return null;
  const fisico = parseFloat(p.estoque_atual || 0);
  const reservado = Math.max(0, parseFloat(p.estoque_reservado || 0));
  const disponivel = Math.max(0, fisico - reservado);
  return {
    ...p,
    ncm: p.ncm || '41131090',
    estoque_atual: fisico,
    estoque_reservado: reservado,
    estoque_disponivel: disponivel
  };
}

export default async function handler(req, res) {
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
  const matchPathId = url.pathname.match(/^\/api\/produtos\/(\d+)$/);
  const idParam = url.searchParams.get('id') || req.query?.id || (matchPathId ? matchPathId[1] : null);

  try {
    if (req.method === 'GET') {
      if (idParam) {
        const prod = await get('SELECT * FROM produtos WHERE id = ?', [idParam]);
        if (!prod) return responder(res, 404, { error: 'Produto não encontrado' });
        return responder(res, 200, enriquecerProduto(prod));
      }

      const q = url.searchParams.get('q');
      const categoria = url.searchParams.get('categoria');

      let sql = 'SELECT * FROM produtos WHERE ativo = 1';
      const params = [];

      if (categoria && categoria !== 'TODAS') {
        sql += ' AND categoria = ?';
        params.push(categoria);
      }

      if (q) {
        sql += ' AND (nome LIKE ? OR codigo_sku LIKE ? OR descricao LIKE ? OR ncm LIKE ?)';
        const termo = `%${q}%`;
        params.push(termo, termo, termo, termo);
      }

      sql += ' ORDER BY categoria ASC, nome ASC';
      const produtos = await query(sql, params);
      return responder(res, 200, produtos.map(enriquecerProduto));
    }

    if (req.method === 'POST' && !idParam) {
      const payload = await parseBody(req);
      if (!payload.nome) {
        return responder(res, 400, { error: 'O nome do produto é obrigatório.' });
      }

      const agora = new Date().toISOString();
      const sku = (payload.codigo_sku && payload.codigo_sku.trim()) || `SKU-${Date.now().toString().slice(-6)}`;
      const categoria = payload.categoria || 'Outros';
      const un = payload.unidade_medida || 'UN';
      const ncm = (payload.ncm || '41131090').replace(/\D/g, '').slice(0, 8) || '41131090';
      const custo = parseFloat(payload.preco_custo || 0);
      const venda = parseFloat(payload.preco_venda || 0);
      const estoque = parseFloat(payload.estoque_atual || 0);
      const reservado = Math.max(0, parseFloat(payload.estoque_reservado || 0));
      const estoqueMin = parseFloat(payload.estoque_minimo || 5);
      const desc = payload.descricao || '';

      const info = await run(`
        INSERT INTO produtos (
          codigo_sku, nome, categoria, unidade_medida, ncm,
          preco_custo, preco_venda, estoque_atual, estoque_reservado, estoque_minimo,
          descricao, ativo, data_cadastro
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `, [sku, payload.nome.trim(), categoria, un, ncm, custo, venda, estoque, reservado, estoqueMin, desc, agora]);

      await registrarLog({
        clienteId: null,
        clienteNome: 'Estoque / Produtos',
        tipoAcao: 'CADASTRO_PRODUTO',
        camposAlterados: ['produto_criado'],
        detalhes: `Produto ${payload.nome} (${sku} | NCM ${ncm}) cadastrado com ${estoque} ${un}`,
        req
      }).catch(() => {});

      return responder(res, 201, {
        success: true,
        id: info.lastInsertRowid,
        codigo_sku: sku,
        nome: payload.nome,
        ncm
      });
    }

    if (req.method === 'PUT' || (req.method === 'POST' && idParam)) {
      if (!idParam) return responder(res, 400, { error: 'ID do produto é obrigatório.' });
      const atual = await get('SELECT * FROM produtos WHERE id = ?', [idParam]);
      if (!atual) return responder(res, 404, { error: 'Produto não encontrado' });

      const payload = await parseBody(req);
      const agora = new Date().toISOString();

      const sku = payload.codigo_sku !== undefined ? String(payload.codigo_sku).trim() : atual.codigo_sku;
      const nome = payload.nome !== undefined ? String(payload.nome).trim() : atual.nome;
      const categoria = payload.categoria !== undefined ? payload.categoria : atual.categoria;
      const un = payload.unidade_medida !== undefined ? payload.unidade_medida : atual.unidade_medida;
      const ncm = payload.ncm !== undefined ? (String(payload.ncm).replace(/\D/g, '').slice(0, 8) || '41131090') : (atual.ncm || '41131090');
      const custo = payload.preco_custo !== undefined ? parseFloat(payload.preco_custo || 0) : parseFloat(atual.preco_custo || 0);
      const venda = payload.preco_venda !== undefined ? parseFloat(payload.preco_venda || 0) : parseFloat(atual.preco_venda || 0);
      const estoque = payload.estoque_atual !== undefined ? parseFloat(payload.estoque_atual || 0) : parseFloat(atual.estoque_atual || 0);
      const reservado = payload.estoque_reservado !== undefined ? Math.max(0, parseFloat(payload.estoque_reservado || 0)) : Math.max(0, parseFloat(atual.estoque_reservado || 0));
      const min = payload.estoque_minimo !== undefined ? parseFloat(payload.estoque_minimo || 5) : parseFloat(atual.estoque_minimo || 5);
      const desc = payload.descricao !== undefined ? payload.descricao : (atual.descricao || '');

      await run(`
        UPDATE produtos SET
          codigo_sku = ?, nome = ?, categoria = ?, unidade_medida = ?, ncm = ?,
          preco_custo = ?, preco_venda = ?, estoque_atual = ?, estoque_reservado = ?, estoque_minimo = ?,
          descricao = ?, data_atualizacao = ?
        WHERE id = ?
      `, [sku, nome, categoria, un, ncm, custo, venda, estoque, reservado, min, desc, agora, idParam]);

      await registrarLog({
        clienteId: null,
        clienteNome: 'Estoque / Produtos',
        tipoAcao: 'EDICAO_PRODUTO',
        camposAlterados: ['produto_atualizado'],
        detalhes: `Produto #${idParam} (${nome} | NCM ${ncm}) atualizado`,
        req
      }).catch(() => {});

      return responder(res, 200, { success: true, id: idParam, message: 'Produto atualizado' });
    }

    if (req.method === 'DELETE') {
      if (!idParam) return responder(res, 400, { error: 'ID do produto é obrigatório.' });
      await run('UPDATE produtos SET ativo = 0 WHERE id = ?', [idParam]);
      return responder(res, 200, { success: true, message: 'Produto desativado com sucesso.' });
    }

    return responder(res, 405, { error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO /api/produtos]', err);
    return responder(res, 500, { error: 'Erro ao processar produto: ' + err.message });
  }
}
