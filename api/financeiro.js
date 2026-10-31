/**
 * Vercel Serverless Function: /api/financeiro
 * Gestão Completa de Contas a Pagar, Contas a Receber e Fluxo de Caixa (Ticket 4)
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
  const matchPathId = url.pathname.match(/^\/api\/financeiro\/(\d+)$/);
  const idParam = url.searchParams.get('id') || req.query?.id || (matchPathId ? matchPathId[1] : null);

  try {
    // 1. GET: Listar lançamentos e calcular resumo de fluxo de caixa
    if (req.method === 'GET') {
      const tipoFiltro = url.searchParams.get('tipo'); // 'RECEBER' | 'PAGAR' | 'TODOS'
      const statusFiltro = url.searchParams.get('status'); // 'PENDENTE' | 'PAGO' | 'ATRASADO'
      const q = url.searchParams.get('q');

      let sql = "SELECT * FROM financeiro_lancamentos WHERE status != 'CANCELADO'";
      const params = [];

      if (tipoFiltro && tipoFiltro !== 'TODOS') {
        sql += ' AND tipo = ?';
        params.push(tipoFiltro);
      }

      if (q) {
        sql += ' AND (descricao LIKE ? OR cliente_nome LIKE ? OR fornecedor_nome LIKE ? OR categoria LIKE ?)';
        const termo = `%${q}%`;
        params.push(termo, termo, termo, termo);
      }

      sql += ' ORDER BY data_vencimento ASC, id DESC';
      const todos = await query(sql, params);
      const hojeIso = new Date().toISOString().slice(0, 10);

      // Processa status de atraso e KPIs
      let totalReceberPendente = 0;
      let totalReceberPago = 0;
      let totalPagarPendente = 0;
      let totalPagarPago = 0;
      let atrasadosCount = 0;
      let atrasadosValor = 0;

      const lancamentosEnriquecidos = todos.map(item => {
        const val = parseFloat(item.valor || 0);
        const isAtrasado = item.status === 'PENDENTE' && item.data_vencimento && item.data_vencimento < hojeIso;
        const statusVisual = isAtrasado ? 'ATRASADO' : item.status;

        if (item.tipo === 'RECEBER') {
          if (item.status === 'PAGO') totalReceberPago += val;
          else if (item.status === 'PENDENTE') totalReceberPendente += val;
        } else if (item.tipo === 'PAGAR') {
          if (item.status === 'PAGO') totalPagarPago += val;
          else if (item.status === 'PENDENTE') totalPagarPendente += val;
        }

        if (isAtrasado) {
          atrasadosCount++;
          atrasadosValor += val;
        }

        return {
          ...item,
          valor: val,
          is_atrasado: isAtrasado,
          status_visual: statusVisual
        };
      });

      const filtrados = statusFiltro && statusFiltro !== 'TODOS'
        ? lancamentosEnriquecidos.filter(l => l.status_visual === statusFiltro || l.status === statusFiltro)
        : lancamentosEnriquecidos;

      const resumoObj = {
        totalReceberPendente,
        totalReceberPago,
        totalPagarPendente,
        totalPagarPago,
        aReceber: totalReceberPendente,
        recebido: totalReceberPago,
        aPagar: totalPagarPendente,
        pago: totalPagarPago,
        saldoRealizado: totalReceberPago - totalPagarPago,
        saldoPrevisto: (totalReceberPago + totalReceberPendente) - (totalPagarPago + totalPagarPendente),
        atrasadosCount,
        emAtrasoCount: atrasadosCount,
        atrasadosValor
      };

      return responder(res, 200, {
        success: true,
        ...resumoObj,
        resumo: resumoObj,
        lancamentos: filtrados
      });
    }

    // 2. POST: Criar lançamento avulso (Receita ou Despesa)
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const tipo = (body.tipo || 'PAGAR').toUpperCase();
      const descricao = (body.descricao || '').trim();
      const valor = parseFloat(body.valor || 0);

      if (!descricao || valor <= 0) {
        return responder(res, 400, { error: 'Descrição e valor maior que zero são obrigatórios.' });
      }

      const agora = new Date();
      const hojeIso = agora.toISOString().slice(0, 10);
      const dataVencimento = body.data_vencimento || hojeIso;
      const status = (body.status || 'PENDENTE').toUpperCase();
      const dataPagamento = status === 'PAGO' ? (body.data_pagamento || hojeIso) : null;
      const categoria = body.categoria || (tipo === 'RECEBER' ? 'Venda Avulsa' : 'Despesa Operacional');
      const formaPagamento = body.forma_pagamento || 'PIX';

      const info = await run(`
        INSERT INTO financeiro_lancamentos (
          tipo, origem, descricao, categoria, cliente_id, cliente_nome,
          fornecedor_id, fornecedor_nome, pedido_id, valor,
          data_vencimento, data_pagamento, forma_pagamento, status,
          observacoes, data_cadastro
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        tipo,
        body.origem || 'MANUAL',
        descricao,
        categoria,
        body.cliente_id ? Number(body.cliente_id) : null,
        body.cliente_nome || '',
        body.fornecedor_id ? Number(body.fornecedor_id) : null,
        body.fornecedor_nome || '',
        body.pedido_id ? Number(body.pedido_id) : null,
        valor,
        dataVencimento,
        dataPagamento,
        formaPagamento,
        status,
        body.observacoes || '',
        agora.toISOString()
      ]);

      await registrarLog({
        clienteId: body.cliente_id ? Number(body.cliente_id) : null,
        clienteNome: body.cliente_nome || body.fornecedor_nome || 'Financeiro',
        tipoAcao: `FINANCEIRO_NOVO_${tipo}`,
        camposAlterados: ['lancamento_criado'],
        detalhes: `${tipo}: ${descricao} | R$ ${valor.toFixed(2)} | Venc: ${dataVencimento}`,
        req
      }).catch(() => {});

      return responder(res, 201, {
        success: true,
        id: info.lastInsertRowid,
        tipo,
        descricao,
        valor,
        status
      });
    }

    // 3. PUT: Dar baixa (PAGO) ou editar lançamento
    if (req.method === 'PUT') {
      const body = await parseBody(req);
      const targetId = idParam || body.id;
      if (!targetId) {
        return responder(res, 400, { error: 'ID do lançamento é obrigatório.' });
      }

      const atual = await get('SELECT * FROM financeiro_lancamentos WHERE id = ?', [targetId]);
      if (!atual) {
        return responder(res, 404, { error: 'Lançamento financeiro não encontrado.' });
      }

      const agora = new Date();
      const hojeIso = agora.toISOString().slice(0, 10);

      const novoStatus = body.status !== undefined ? body.status.toUpperCase() : atual.status;
      const dataPagamento = novoStatus === 'PAGO'
        ? (body.data_pagamento || atual.data_pagamento || hojeIso)
        : null;

      const descricao = body.descricao !== undefined ? body.descricao.trim() : atual.descricao;
      const categoria = body.categoria !== undefined ? body.categoria : atual.categoria;
      const valor = body.valor !== undefined ? parseFloat(body.valor || 0) : parseFloat(atual.valor || 0);
      const dataVencimento = body.data_vencimento !== undefined ? body.data_vencimento : atual.data_vencimento;
      const formaPagamento = body.forma_pagamento !== undefined ? body.forma_pagamento : atual.forma_pagamento;
      const obs = body.observacoes !== undefined ? body.observacoes : atual.observacoes;

      await run(`
        UPDATE financeiro_lancamentos SET
          descricao = ?, categoria = ?, valor = ?, data_vencimento = ?,
          data_pagamento = ?, forma_pagamento = ?, status = ?, observacoes = ?,
          data_atualizacao = ?
        WHERE id = ?
      `, [descricao, categoria, valor, dataVencimento, dataPagamento, formaPagamento, novoStatus, obs, agora.toISOString(), targetId]);

      await registrarLog({
        clienteId: atual.cliente_id,
        clienteNome: atual.cliente_nome || atual.fornecedor_nome || 'Financeiro',
        tipoAcao: 'FINANCEIRO_ATUALIZADO',
        camposAlterados: ['status', 'pagamento'],
        detalhes: `Lançamento #${targetId} (${descricao}) -> ${novoStatus} (R$ ${valor.toFixed(2)})`,
        req
      }).catch(() => {});

      return responder(res, 200, { success: true, id: targetId, status: novoStatus });
    }

    // 4. DELETE: Excluir lançamento
    if (req.method === 'DELETE') {
      if (!idParam) return responder(res, 400, { error: 'ID obrigatório para exclusão.' });
      await run('DELETE FROM financeiro_lancamentos WHERE id = ?', [idParam]);
      return responder(res, 200, { success: true, id: idParam });
    }

    return responder(res, 405, { error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO /api/financeiro]', err);
    return responder(res, 500, { error: 'Erro no módulo financeiro: ' + err.message });
  }
}

