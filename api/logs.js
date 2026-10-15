/**
 * Vercel Serverless Function: /api/logs
 * Retorna os logs de auditoria gravados diretamente no banco de dados ativo
 */

import { query } from '../lib/db.js';

function responder(res, status, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(data);
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      return res.status(204).end();
    }
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    });
    return res.end();
  }

  if (req.method !== 'GET') {
    return responder(res, 405, { error: 'Método não permitido' });
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const clienteId = url.searchParams.get('cliente_id') || req.query?.cliente_id;

    let sql = 'SELECT * FROM logs_auditoria';
    const params = [];

    if (clienteId) {
      sql += ' WHERE cliente_id = ?';
      params.push(parseInt(clienteId, 10));
    }

    sql += ' ORDER BY id DESC LIMIT 100';

    const logs = await query(sql, params);
    return responder(res, 200, logs);
  } catch (err) {
    console.error('[API LOGS ERRO]', err);
    return responder(res, 500, { error: 'Erro ao buscar logs: ' + err.message });
  }
}
