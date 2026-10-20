/**
 * Vercel Serverless Function: /api/produtos
 * Suporta GET (listar/buscar), POST (criar), PUT (atualizar), DELETE (excluir)
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
  const idParam = url.searchParams.get('id') || req.query?.id;

  try {
    if (req.method === 'GET') {
      if (idParam) {
        const prod = await get('SELECT * FROM produtos WHERE id = ?', [idParam]);
        if (!prod) return responder(res, 404, { error: 'Produto não encontrado' });
        return responder(res, 200, prod);
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
        sql += ' AND (nome LIKE ? OR codigo_sku LIKE ? OR descricao LIKE ?)';
        const termo = `%${q}%`;
        params.push(termo, termo, termo);
      }

      sql += ' ORDER BY categoria ASC, nome ASC';
      const produtos = await query(sql, params);
      return responder(res, 200, produtos);
    }

    if (req.method === 'POST') {
      const payload = await parseBody(req);
      if (!payload.nome) {
        return responder(res, 400, { error: 'O nome do produto é obrigatório.' });
      }

      const agora = new Date().toISOString();
      const sku = (payload.codigo_sku && payload.codigo_sku.trim()) || `SKU-${Date.now().toString().slice(-6)}`;
      const categoria = payload.categoria || 'Outros';
      const un = payload.unidade_medida || 'UN';
      const custo = parseFloat(payload.preco_custo || 0);
      const venda = parseFloat(payload.preco_venda || 0);
      const estoque = parseFloat(payload.estoque_atual || 0);
      const estoqueMin = parseFloat(payload.estoque_minimo || 5);
      const desc = payload.descricao || '';

      const info = await run(`
        INSERT INTO produtos (
          codigo_sku, nome, categoria, unidade_medida,
          preco_custo, preco_venda, estoque_atual, estoque_minimo,
          descricao, ativo, data_cadastro
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `, [sku, payload.nome.trim(), categoria, un, custo, venda, estoque, estoqueMin, desc, agora]);

      return responder(res, 201, {
        success: true,
        id: info.lastInsertRowid,
        codigo_sku: sku,
        nome: payload.nome
      });
    }

    if (req.method === 'PUT') {
      if (!idParam) return responder(res, 400, { error: 'ID do produto é obrigatório.' });
      const payload = await parseBody(req);
      const agora = new Date().toISOString();

      await run(`
        UPDATE produtos SET
          nome = ?, categoria = ?, unidade_medida = ?,
          preco_custo = ?, preco_venda = ?, estoque_atual = ?, estoque_minimo = ?,
          descricao = ?, data_atualizacao = ?
        WHERE id = ?
      `, [
        payload.nome, payload.categoria, payload.unidade_medida,
        parseFloat(payload.preco_custo || 0), parseFloat(payload.preco_venda || 0),
        parseFloat(payload.estoque_atual || 0), parseFloat(payload.estoque_minimo || 5),
        payload.descricao || '', agora, idParam
      ]);

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
