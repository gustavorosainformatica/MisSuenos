/**
 * Vercel Serverless Function: /api/pedidos
 * Suporta GET (listar/buscar), POST (criar), PUT (atualizar), DELETE (excluir)
 * Persistência unificada via lib/db.js (Turso Cloud ou SQLite Local)
 * Auditoria integrada no próprio banco de dados
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
  const idParam = url.searchParams.get('id') || req.query?.id;

  try {
    // 1. GET: Listar todos ou obter por ID
    if (req.method === 'GET') {
      if (idParam) {
        const ped = await get('SELECT * FROM pedidos WHERE id = ?', [idParam]);
        if (!ped) {
          return responder(res, 404, { error: 'Pedido não encontrado' });
        }
        return responder(res, 200, ped);
      }

      const q = url.searchParams.get('q');
      const status = url.searchParams.get('status');

      let sql = 'SELECT * FROM pedidos WHERE 1=1';
      const params = [];

      if (status && status !== 'TODOS') {
        sql += ' AND status = ?';
        params.push(status);
      }

      if (q) {
        sql += ' AND (numero LIKE ? OR cliente_nome LIKE ? OR cidade LIKE ? OR itens LIKE ?)';
        const termo = `%${q}%`;
        params.push(termo, termo, termo, termo);
      }

      sql += ' ORDER BY id DESC';

      const pedidos = await query(sql, params);
      return responder(res, 200, pedidos);
    }

    // 2. POST: Criar novo pedido
    if (req.method === 'POST') {
      const payload = await parseBody(req);

      if (!payload.cliente_nome || !payload.cliente_nome.trim()) {
        return responder(res, 400, { error: 'O nome do cliente é obrigatório.' });
      }
      if (!payload.itens || !payload.itens.trim()) {
        return responder(res, 400, { error: 'Informe ao menos um item para o pedido.' });
      }

      // Gera número sequencial amigável caso não informado
      let numero = payload.numero && payload.numero.trim();
      if (!numero) {
        const ultimos = await query('SELECT id FROM pedidos ORDER BY id DESC LIMIT 1');
        const proximoId = (ultimos[0]?.id || 1042) + 1;
        numero = `#PED-${proximoId}`;
      }

      const agora = new Date();
      const dataFormatada = `${String(agora.getDate()).padStart(2, '0')}/${String(agora.getMonth() + 1).padStart(2, '0')}/${agora.getFullYear()}`;

      const status = payload.status || 'AGUARDANDO_ENVIO';
      const statusMap = {
        'AGUARDANDO_ENVIO': 'Aguardando Envio',
        'EM_SEPARACAO': 'Em Separação',
        'ENVIADO': 'Enviado',
        'CANCELADO': 'Cancelado'
      };
      const statusTexto = payload.status_texto || statusMap[status] || 'Aguardando Envio';

      const valorTotal = parseFloat(payload.valor_total || payload.valor || 0);

      const info = await run(`
        INSERT INTO pedidos (
          numero, cliente_id, cliente_nome, cidade, uf, telefone,
          itens, valor_total, status, status_texto, codigo_rastreio,
          observacoes, data_pedido, data_atualizacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        numero,
        payload.cliente_id ? Number(payload.cliente_id) : null,
        payload.cliente_nome.trim(),
        payload.cidade ? payload.cidade.trim().toUpperCase() : '',
        payload.uf ? payload.uf.trim().toUpperCase() : 'RS',
        payload.telefone ? payload.telefone.trim() : '',
        payload.itens.trim(),
        valorTotal,
        status,
        statusTexto,
        payload.codigo_rastreio ? payload.codigo_rastreio.trim() : '',
        payload.observacoes ? payload.observacoes.trim() : '',
        payload.data_pedido || dataFormatada,
        agora.toISOString()
      ]);

      const novoId = info.lastInsertRowid;

      await registrarLog({
        clienteId: payload.cliente_id ? Number(payload.cliente_id) : null,
        clienteNome: payload.cliente_nome.trim(),
        tipoAcao: 'NOVO_PEDIDO',
        camposAlterados: ['pedido_criado'],
        detalhes: `Pedido ${numero} cadastrado no valor de R$ ${valorTotal.toFixed(2)} (${statusTexto})`,
        req
      });

      return responder(res, 201, {
        success: true,
        id: novoId,
        numero,
        cliente_nome: payload.cliente_nome,
        valor_total: valorTotal,
        status,
        status_texto: statusTexto
      });
    }

    // 3. PUT: Atualizar pedido existente
    if (req.method === 'PUT') {
      if (!idParam) {
        return responder(res, 400, { error: 'ID do pedido é obrigatório para atualização.' });
      }

      const pedidoExistente = await get('SELECT * FROM pedidos WHERE id = ?', [idParam]);
      if (!pedidoExistente) {
        return responder(res, 404, { error: 'Pedido não encontrado.' });
      }

      const payload = await parseBody(req);
      const campos = [];
      const params = [];

      const camposPossiveis = [
        'cliente_id', 'cliente_nome', 'cidade', 'uf', 'telefone',
        'itens', 'valor_total', 'status', 'status_texto', 'codigo_rastreio',
        'observacoes', 'data_pedido'
      ];

      for (const campo of camposPossiveis) {
        if (payload[campo] !== undefined) {
          campos.push(`${campo} = ?`);
          if (campo === 'valor_total') {
            params.push(parseFloat(payload[campo] || 0));
          } else if (campo === 'cliente_id') {
            params.push(payload[campo] ? Number(payload[campo]) : null);
          } else {
            params.push(payload[campo]);
          }
        }
      }

      if (campos.length === 0) {
        return responder(res, 400, { error: 'Nenhum campo fornecido para atualização.' });
      }

      campos.push('data_atualizacao = ?');
      params.push(new Date().toISOString());
      params.push(idParam);

      await run(`UPDATE pedidos SET ${campos.join(', ')} WHERE id = ?`, params);

      await registrarLog({
        clienteId: pedidoExistente.cliente_id,
        clienteNome: pedidoExistente.cliente_nome,
        tipoAcao: 'ATUALIZAR_PEDIDO',
        camposAlterados: campos.map(c => c.split(' =')[0]),
        detalhes: `Pedido ${pedidoExistente.numero} atualizado`,
        req
      });

      return responder(res, 200, { success: true, id: idParam, message: 'Pedido atualizado com sucesso.' });
    }

    // 4. DELETE: Excluir pedido
    if (req.method === 'DELETE') {
      if (!idParam) {
        return responder(res, 400, { error: 'ID do pedido é obrigatório para exclusão.' });
      }

      const pedidoExistente = await get('SELECT * FROM pedidos WHERE id = ?', [idParam]);
      if (!pedidoExistente) {
        return responder(res, 404, { error: 'Pedido não encontrado.' });
      }

      await run('DELETE FROM pedidos WHERE id = ?', [idParam]);

      await registrarLog({
        clienteId: pedidoExistente.cliente_id,
        clienteNome: pedidoExistente.cliente_nome,
        tipoAcao: 'EXCLUIR_PEDIDO',
        camposAlterados: ['pedido_excluido'],
        detalhes: `Pedido ${pedidoExistente.numero} excluído do banco`,
        req
      });

      return responder(res, 200, { success: true, id: idParam, message: 'Pedido excluído com sucesso.' });
    }

    return responder(res, 405, { error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO /api/pedidos]', err);
    return responder(res, 500, { error: 'Erro interno ao processar pedido: ' + err.message });
  }
}
