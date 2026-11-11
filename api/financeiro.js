/**
 * Vercel Serverless Function: /api/financeiro
 * Gestão Completa de Contas a Pagar, Contas a Receber e Fluxo de Caixa (Ticket 4)
 * Persistência unificada via lib/db.js (Turso Cloud ou SQLite Local)
 */

import { query, get, run, registrarLog } from '../lib/db.js';
import {
  parseOfx,
  parseCsvBancario,
  conciliarExtratoComLancamentos
} from '../lib/conciliacao_bancaria.js';

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
  const pathname = url.pathname;
  const matchPathId = url.pathname.match(/^\/api\/financeiro\/(\d+)$/);
  const idParam = url.searchParams.get('id') || req.query?.id || (matchPathId ? matchPathId[1] : null);

  try {
    // =========================================================================
    // SUB-ROTA CONCILIAÇÃO: POST /api/financeiro/conciliacao/upload
    // =========================================================================
    if ((pathname === '/api/financeiro/conciliacao/upload' || url.searchParams.get('acao') === 'conciliacao_upload') && req.method === 'POST') {
      const body = await parseBody(req);
      const conteudoExtrato = body.conteudo || body.conteudoExtrato || body.extrato || '';
      const tipoArquivo = (body.tipoArquivo || body.formato || '').toUpperCase();
      const bancoNome = (body.banco || 'BANCO').toUpperCase();

      if (!conteudoExtrato) {
        return responder(res, 400, { error: 'O conteúdo do arquivo de extrato (.OFX ou .CSV) é obrigatório.' });
      }

      let parsed;
      if (tipoArquivo === 'CSV' || (!conteudoExtrato.includes('<OFX>') && !conteudoExtrato.includes('OFXHEADER') && (conteudoExtrato.includes(';') || conteudoExtrato.includes(',')))) {
        parsed = parseCsvBancario(conteudoExtrato, { banco: bancoNome });
      } else {
        parsed = parseOfx(conteudoExtrato);
      }

      // Busca lançamentos pendentes no ERP
      const lancamentosPendentes = await query("SELECT * FROM financeiro_lancamentos WHERE status = 'PENDENTE'");

      // Executa matching heurístico
      const reconciliacao = conciliarExtratoComLancamentos(parsed.transacoes, lancamentosPendentes);

      // Grava transações na tabela conciliacao_extratos com persistência idempotente
      const agora = new Date().toISOString();
      for (const r of reconciliacao.resultados) {
        const t = r.transacao_extrato;
        const matchId = r.sugestao ? r.sugestao.lancamento_id : null;
        await run(`
          INSERT INTO conciliacao_extratos (
            origem, fitid, data_transacao, descricao, tipo, valor, status, transacao_financeiro_id, score_match, criado_em
          ) VALUES (?, ?, ?, ?, ?, ?, 'PENDENTE', ?, ?, ?)
          ON CONFLICT(fitid) DO UPDATE SET
            score_match = excluded.score_match,
            transacao_financeiro_id = excluded.transacao_financeiro_id
        `, [
          t.origem || parsed.formato,
          t.fitid,
          t.data,
          t.descricao,
          t.tipo,
          t.valor,
          matchId,
          r.score,
          agora
        ]);
      }

      await registrarLog({
        tipoAcao: 'CONCILIACAO_EXTRATO_UPLOAD',
        detalhes: `Upload de extrato ${parsed.formato} (${parsed.banco}). ${parsed.totalTransacoes} transações processadas (${reconciliacao.total_auto_conciliavel} sugeridas automáticas).`
      }).catch(() => {});

      return responder(res, 200, {
        success: true,
        formato: parsed.formato,
        banco: parsed.banco,
        conta: parsed.conta,
        saldoFinal: parsed.saldoFinal,
        totalTransacoes: parsed.totalTransacoes,
        totalCreditos: parsed.totalCreditos,
        totalDebitos: parsed.totalDebitos,
        total_auto_conciliavel: reconciliacao.total_auto_conciliavel,
        total_com_match: reconciliacao.total_com_match,
        total_sem_match: reconciliacao.total_sem_match,
        transacoes: reconciliacao.resultados
      });
    }

    // =========================================================================
    // SUB-ROTA CONCILIAÇÃO: POST /api/financeiro/conciliacao/reconciliar-lote
    // =========================================================================
    if ((pathname === '/api/financeiro/conciliacao/reconciliar-lote' || url.searchParams.get('acao') === 'reconciliar_lote') && req.method === 'POST') {
      const body = await parseBody(req);
      const lote = Array.isArray(body.reconciliacoes) ? body.reconciliacoes : [];

      if (lote.length === 0) {
        return responder(res, 400, { error: 'Lista de transações para reconciliação vazia ou não informada.' });
      }

      const agora = new Date();
      const hojeIso = agora.toISOString().slice(0, 10);
      let totalBaixados = 0;
      let totalTarifasCriadas = 0;

      for (const item of lote) {
        const lancId = item.lancamento_id;
        const fitid = item.fitid;
        const dataPagamento = item.data_pagamento || hojeIso;
        const difTarifa = parseFloat(item.diferenca_tarifa || 0);

        if (lancId) {
          // Baixa no lançamento do ERP
          await run(`
            UPDATE financeiro_lancamentos 
            SET status = 'PAGO', data_pagamento = ?, data_atualizacao = ?
            WHERE id = ?
          `, [dataPagamento, agora.toISOString(), lancId]);
          totalBaixados++;

          // Se houver diferença por tarifa bancária (ex: taxa boleto R$ 1,50)
          if (difTarifa > 0) {
            await run(`
              INSERT INTO financeiro_lancamentos (
                tipo, origem, descricao, categoria, valor, data_vencimento, data_pagamento, forma_pagamento, status, observacoes, data_cadastro
              ) VALUES ('PAGAR', 'CONCILIACAO_TARIFA', ?, 'TARIFAS BANCÁRIAS', ?, ?, ?, 'DÉBITO EM CONTA', 'PAGO', ?, ?)
            `, [
              `TARIFA BANCÁRIA / DESCONTO (REF FITID ${fitid || lancId})`,
              difTarifa,
              dataPagamento,
              dataPagamento,
              `Ajuste automático de conciliação para o lançamento #${lancId}`,
              agora.toISOString()
            ]);
            totalTarifasCriadas++;
          }
        }

        // Atualiza a tabela conciliacao_extratos
        if (fitid) {
          await run(`
            UPDATE conciliacao_extratos
            SET status = 'CONCILIADO', transacao_financeiro_id = ?
            WHERE fitid = ?
          `, [lancId || null, fitid]);
        }
      }

      await registrarLog({
        tipoAcao: 'CONCILIACAO_LOTE_CONFIRMADA',
        detalhes: `Reconciliação em lote executada. ${totalBaixados} títulos baixados e ${totalTarifasCriadas} tarifas ajustadas.`
      }).catch(() => {});

      return responder(res, 200, {
        success: true,
        mensagem: `${totalBaixados} título(s) reconciliado(s) com sucesso!`,
        total_reconciliados: totalBaixados,
        total_tarifas_ajustadas: totalTarifasCriadas
      });
    }

    // =========================================================================
    // SUB-ROTA CONCILIAÇÃO: GET /api/financeiro/conciliacao/extratos
    // =========================================================================
    if (pathname === '/api/financeiro/conciliacao/extratos' && req.method === 'GET') {
      const statusExtrato = url.searchParams.get('status');
      let sql = 'SELECT * FROM conciliacao_extratos';
      const params = [];
      if (statusExtrato) {
        sql += ' WHERE status = ?';
        params.push(statusExtrato.toUpperCase());
      }
      sql += ' ORDER BY data_transacao DESC, id DESC LIMIT 200';
      const extratos = await query(sql, params);
      return responder(res, 200, {
        success: true,
        total: extratos.length,
        extratos
      });
    }
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
          status_visual: statusVisual,
          recorrente: Boolean(item.recorrente)
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
          observacoes, recorrente, data_cadastro
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
        body.recorrente ? 1 : 0,
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

