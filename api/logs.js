/**
 * Vercel Serverless Function: /api/logs
 * Consulta avançada de trilha de auditoria com paginação, busca e filtros
 * Autor: Gustavo Rosa Informática
 * Projeto: Mis Sueños ERP v2.0
 */

import { query, get } from '../lib/db.js';

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
    const modulo = url.searchParams.get('modulo') || req.query?.modulo;
    const tipoAcao = url.searchParams.get('tipo_acao') || req.query?.tipo_acao;
    const usuarioId = url.searchParams.get('usuario_id') || req.query?.usuario_id;
    const clienteId = url.searchParams.get('cliente_id') || req.query?.cliente_id;
    const busca = (url.searchParams.get('busca') || req.query?.busca || '').trim();
    const dataInicio = url.searchParams.get('data_inicio') || req.query?.data_inicio;
    const dataFim = url.searchParams.get('data_fim') || req.query?.data_fim;

    const page = Math.max(1, parseInt(url.searchParams.get('page') || req.query?.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || req.query?.limit || '50', 10)));
    const offset = (page - 1) * limit;

    const whereClauses = [];
    const params = [];

    if (modulo && modulo !== 'TODOS') {
      whereClauses.push('UPPER(modulo) = ?');
      params.push(modulo.toUpperCase());
    }

    if (tipoAcao && tipoAcao !== 'TODOS') {
      whereClauses.push('UPPER(tipo_acao) = ?');
      params.push(tipoAcao.toUpperCase());
    }

    if (usuarioId) {
      whereClauses.push('usuario_id = ?');
      params.push(parseInt(usuarioId, 10));
    }

    if (clienteId) {
      whereClauses.push('cliente_id = ?');
      params.push(parseInt(clienteId, 10));
    }

    if (busca) {
      whereClauses.push('(referencia_id LIKE ? OR descricao LIKE ? OR usuario_nome LIKE ? OR cliente_nome LIKE ?)');
      const termoLike = `%${busca}%`;
      params.push(termoLike, termoLike, termoLike, termoLike);
    }

    if (dataInicio) {
      whereClauses.push('data_hora >= ?');
      params.push(dataInicio);
    }

    if (dataFim) {
      whereClauses.push('data_hora <= ?');
      params.push(dataFim + ' 23:59:59');
    }

    const whereSql = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

    // Conta total de registros para a paginação
    const countRow = await get(`SELECT COUNT(*) as total FROM logs_auditoria${whereSql}`, params);
    const total = Number(countRow?.total || 0);
    const totalPages = Math.ceil(total / limit) || 1;

    // Busca registros paginados
    const sql = `SELECT * FROM logs_auditoria${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`;
    const logs = await query(sql, [...params, limit, offset]);

    // Busca lista de módulos ativos para filtros dinâmicos
    const modulosRows = await query("SELECT DISTINCT modulo FROM logs_auditoria WHERE modulo IS NOT NULL AND modulo != '' ORDER BY modulo ASC");
    const modulos = modulosRows.map(r => r.modulo);

    return responder(res, 200, {
      success: true,
      logs,
      total,
      page,
      limit,
      totalPages,
      modulos
    });
  } catch (err) {
    console.error('[API LOGS ERRO]', err);
    return responder(res, 500, { error: 'Erro ao buscar logs de auditoria: ' + err.message });
  }
}
