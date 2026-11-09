/**
 * Vercel Serverless Function: /api/pedidos
 * Suporta GET (listar/buscar), POST (criar), PUT (atualizar), DELETE (excluir)
 * 
 * Recursos Avançados (Tickets 3 e 4):
 * - Controle Automático de Estoque com Reserva (Físico vs. Reservado vs. Disponível)
 * - Geração Automática de Contas a Receber ao fechar pedido
 * - Persistência unificada via lib/db.js (Turso Cloud ou SQLite Local)
 */

import { query, get, run, registrarLog } from '../lib/db.js';
import { calcularProximoNumeroPedido } from '../lib/calculos_erp.js';

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

function isStatusPendente(st) {
  return st === 'AGUARDANDO_ENVIO' || st === 'EM_SEPARACAO';
}

function isStatusConcluido(st) {
  return st === 'ENVIADO' || st === 'ENTREGUE';
}

function desformatarNumeroPtBr(valor) {
  if (typeof valor === 'number') return isNaN(valor) ? 0 : valor;
  if (!valor) return 0;
  const str = String(valor).trim().replace(/[R$\s]/g, '');
  if (str.includes(',')) {
    const limpo = str.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(limpo);
    return isNaN(n) ? 0 : n;
  }
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

/**
 * Identifica quais produtos do catálogo estão presentes no texto ou array de itens do pedido
 */
async function identificarItensEstoque(textoItens, itensDetalhados) {
  const resultado = [];
  if (Array.isArray(itensDetalhados) && itensDetalhados.length > 0) {
    for (const it of itensDetalhados) {
      if (it.produto_id && Number(it.qtd) > 0) {
        resultado.push({ id: Number(it.produto_id), qtd: Number(it.qtd) });
      }
    }
    if (resultado.length > 0) return resultado;
  }

  if (!textoItens || typeof textoItens !== 'string') return resultado;
  const todosProdutos = await query('SELECT id, codigo_sku, nome FROM produtos WHERE ativo = 1');
  const partes = textoItens.split(/[,;\n+]/).map(s => s.trim()).filter(Boolean);

  for (const parte of partes) {
    const parteUpper = parte.toUpperCase();
    // Extrai quantidade inicial ex: "3x Lonca", "2 un Pele", "5 COD-01"
    const matchQtd = parte.match(/^(\d+(?:[.,]\d+)?)\s*(?:x|un|unid|pç|pc|peças|pecas|rolos|kg|m)?\b/i);
    const qtd = matchQtd ? parseFloat(matchQtd[1].replace(',', '.')) : 1;

    let prodEncontrado = todosProdutos.find(p => p.codigo_sku && parteUpper.includes(p.codigo_sku.toUpperCase()));
    if (!prodEncontrado) {
      prodEncontrado = todosProdutos.find(p => p.nome && parteUpper.includes(p.nome.toUpperCase()));
    }
    if (!prodEncontrado) {
      // Busca por palavras-chave significativas (> 4 letras)
      prodEncontrado = todosProdutos.find(p => {
        const palavras = (p.nome || '').toUpperCase().split(/\s+/).filter(w => w.length >= 4);
        return palavras.length >= 2 && palavras.slice(0, 2).every(w => parteUpper.includes(w));
      });
    }

    if (prodEncontrado && qtd > 0) {
      resultado.push({ id: prodEncontrado.id, qtd });
    }
  }
  return resultado;
}

/**
 * Aplica movimentação de estoque (Reserva, Baixa Definitiva ou Estorno)
 */
async function movimentarEstoquePedido(itensExtraidos, operacao) {
  const agora = new Date().toISOString();
  for (const item of itensExtraidos) {
    const prod = await get('SELECT id, estoque_atual, estoque_reservado FROM produtos WHERE id = ?', [item.id]);
    if (!prod) continue;

    let fisico = parseFloat(prod.estoque_atual || 0);
    let reservado = Math.max(0, parseFloat(prod.estoque_reservado || 0));

    if (operacao === 'RESERVAR') {
      reservado += item.qtd;
    } else if (operacao === 'BAIXAR_DIRETO') {
      fisico = Math.max(0, fisico - item.qtd);
    } else if (operacao === 'CONVERTER_RESERVA_EM_BAIXA') {
      reservado = Math.max(0, reservado - item.qtd);
      fisico = Math.max(0, fisico - item.qtd);
    } else if (operacao === 'LIBERAR_RESERVA') {
      reservado = Math.max(0, reservado - item.qtd);
    } else if (operacao === 'ESTORNAR_BAIXA_PARA_RESERVA') {
      fisico += item.qtd;
      reservado += item.qtd;
    } else if (operacao === 'ESTORNAR_BAIXA_TOTAL') {
      fisico += item.qtd;
    }

    await run(
      'UPDATE produtos SET estoque_atual = ?, estoque_reservado = ?, data_atualizacao = ? WHERE id = ?',
      [fisico, reservado, agora, prod.id]
    );
  }
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
  const matchPathId = url.pathname.match(/^\/api\/pedidos\/(\d+)$/);
  const idParam = url.searchParams.get('id') || req.query?.id || (matchPathId ? matchPathId[1] : null);

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

    // 2. POST: Criar novo pedido (com Reserva de Estoque + Geração Automática de Contas a Receber)
    if (req.method === 'POST') {
      const payload = await parseBody(req);

      if (!payload.cliente_nome || !payload.cliente_nome.trim()) {
        return responder(res, 400, { error: 'O nome do cliente é obrigatório.' });
      }
      if (!payload.itens || !payload.itens.trim()) {
        return responder(res, 400, { error: 'Informe ao menos um item para o pedido.' });
      }

      let numero = payload.numero && payload.numero.trim();
      if (!numero) {
        const todosPedidos = await query('SELECT numero FROM pedidos');
        numero = calcularProximoNumeroPedido(todosPedidos);
      } else {
        // Blindagem contra colisão: se o número informado já existir no banco, auto-incrementa sem estourar UNIQUE
        const existente = await get('SELECT id FROM pedidos WHERE numero = ?', [numero]);
        if (existente) {
          const todosPedidos = await query('SELECT numero FROM pedidos');
          numero = calcularProximoNumeroPedido(todosPedidos);
        }
      }

      const agora = new Date();
      const hojeIso = agora.toISOString().slice(0, 10);
      const dataFormatada = `${String(agora.getDate()).padStart(2, '0')}/${String(agora.getMonth() + 1).padStart(2, '0')}/${agora.getFullYear()}`;

      const status = payload.status || 'AGUARDANDO_ENVIO';
      const statusMap = {
        'AGUARDANDO_ENVIO': 'Aguardando Envio',
        'EM_SEPARACAO': 'Em Separação',
        'ENVIADO': 'Enviado',
        'ENTREGUE': 'Entregue',
        'CANCELADO': 'Cancelado'
      };
      const statusTexto = payload.status_texto || statusMap[status] || 'Aguardando Envio';
      const valorTotal = desformatarNumeroPtBr(payload.valor_total !== undefined ? payload.valor_total : (payload.valor || 0));

      const info = await run(`
        INSERT INTO pedidos (
          numero, cliente_id, cliente_nome, cidade, uf, telefone,
          itens, valor_total, valor_frete, status, status_texto, codigo_rastreio,
          observacoes, data_pedido, data_atualizacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        numero,
        payload.cliente_id ? Number(payload.cliente_id) : null,
        payload.cliente_nome.trim(),
        payload.cidade ? payload.cidade.trim().toUpperCase() : '',
        payload.uf ? payload.uf.trim().toUpperCase() : 'RS',
        payload.telefone ? payload.telefone.trim() : '',
        payload.itens.trim(),
        valorTotal,
        parseFloat(payload.valor_frete || 0) || 0,
        status,
        statusTexto,
        payload.codigo_rastreio ? payload.codigo_rastreio.trim() : '',
        payload.observacoes ? payload.observacoes.trim() : '',
        payload.data_pedido || dataFormatada,
        agora.toISOString()
      ]);

      const novoId = info.lastInsertRowid;
      // Auto-atualiza telefone no cadastro do cliente se informado no pedido
      if (payload.cliente_id && payload.telefone && payload.telefone.trim()) {
        try {
          await run(`
            UPDATE clientes 
            SET telefone = ? 
            WHERE id = ? AND (telefone IS NULL OR telefone = '' OR telefone != ?)
          `, [payload.telefone.trim(), Number(payload.cliente_id), payload.telefone.trim()]);
        } catch (errCli) {
          console.warn('[AVISO] Falha ao sincronizar telefone do cliente:', errCli.message);
        }
      }


      // Movimenta Estoque (Reserva se pendente, ou baixa direto se já criado como enviado)
      const itensEstoque = await identificarItensEstoque(payload.itens, payload.itens_detalhados);
      if (itensEstoque.length > 0) {
        if (isStatusPendente(status)) {
          await movimentarEstoquePedido(itensEstoque, 'RESERVAR');
        } else if (isStatusConcluido(status)) {
          await movimentarEstoquePedido(itensEstoque, 'BAIXAR_DIRETO');
        }
      }

      // Gera automaticamente o lançamento no Contas a Receber (Ticket 4)
      let lancamentoFinanceiroId = null;
      if (valorTotal > 0 && status !== 'CANCELADO') {
        const formaPag = payload.forma_pagamento || 'PIX';
        const statusFin = payload.pago_na_hora ? 'PAGO' : 'PENDENTE';
        const dataVenc = payload.data_vencimento || hojeIso;
        const dataPag = statusFin === 'PAGO' ? hojeIso : null;

        const finInfo = await run(`
          INSERT INTO financeiro_lancamentos (
            tipo, origem, descricao, categoria, cliente_id, cliente_nome,
            pedido_id, valor, data_vencimento, data_pagamento, forma_pagamento,
            status, observacoes, data_cadastro
          ) VALUES ('RECEBER', 'PEDIDO', ?, 'Venda de Mercadorias', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          `Venda Pedido ${numero} - ${payload.itens.trim().slice(0, 60)}`,
          payload.cliente_id ? Number(payload.cliente_id) : null,
          payload.cliente_nome.trim(),
          novoId,
          valorTotal,
          dataVenc,
          dataPag,
          formaPag,
          statusFin,
          `Gerado automaticamente a partir do pedido ${numero}`,
          agora.toISOString()
        ]);
        lancamentoFinanceiroId = finInfo.lastInsertRowid;
      }

      await registrarLog({
        clienteId: payload.cliente_id ? Number(payload.cliente_id) : null,
        clienteNome: payload.cliente_nome.trim(),
        tipoAcao: 'NOVO_PEDIDO',
        camposAlterados: ['pedido_criado', 'estoque_reservado', 'conta_receber_gerada'],
        detalhes: `Pedido ${numero} cadastrado (R$ ${valorTotal.toFixed(2)} | ${statusTexto}) | Itens reservados: ${itensEstoque.length}`,
        req
      }).catch(() => {});

      return responder(res, 201, {
        success: true,
        id: novoId,
        numero,
        cliente_nome: payload.cliente_nome,
        valor_total: valorTotal,
        status,
        status_texto: statusTexto,
        itens_reservados: itensEstoque,
        lancamento_financeiro_id: lancamentoFinanceiroId
      });
    }

    // 3. PUT: Atualizar pedido existente e sincronizar Estoque / Financeiro
    if (req.method === 'PUT') {
      if (!idParam) {
        return responder(res, 400, { error: 'ID do pedido é obrigatório para atualização.' });
      }

      const pedidoExistente = await get('SELECT * FROM pedidos WHERE id = ?', [idParam]);
      if (!pedidoExistente) {
        return responder(res, 404, { error: 'Pedido não encontrado.' });
      }

      const payload = await parseBody(req);
      const statusAnterior = pedidoExistente.status;
      const novoStatus = payload.status || statusAnterior;

      const statusMap = {
        'AGUARDANDO_ENVIO': 'Aguardando Envio',
        'EM_SEPARACAO': 'Em Separação',
        'ENVIADO': 'Enviado',
        'ENTREGUE': 'Entregue',
        'CANCELADO': 'Cancelado'
      };
      if (payload.status && !payload.status_texto) {
        payload.status_texto = statusMap[payload.status] || payload.status;
      }

      const campos = [];
      const params = [];

      const camposPossiveis = [
        'cliente_id', 'cliente_nome', 'cidade', 'uf', 'telefone',
        'itens', 'valor_total', 'valor_frete', 'status', 'status_texto', 'codigo_rastreio',
        'observacoes', 'data_pedido'
      ];

      for (const campo of camposPossiveis) {
        if (payload[campo] !== undefined) {
          campos.push(`${campo} = ?`);
          if (campo === 'valor_total') {
            params.push(desformatarNumeroPtBr(payload[campo]));
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

      const agoraIso = new Date().toISOString();
      campos.push('data_atualizacao = ?');
      params.push(agoraIso);
      params.push(idParam);

      await run(`UPDATE pedidos SET ${campos.join(', ')} WHERE id = ?`, params);

      // Auto-atualiza telefone no cadastro do cliente se alterado no PUT
      if (payload.cliente_id && payload.telefone && payload.telefone.trim()) {
        try {
          await run(`
            UPDATE clientes 
            SET telefone = ? 
            WHERE id = ? AND (telefone IS NULL OR telefone = '' OR telefone != ?)
          `, [payload.telefone.trim(), Number(payload.cliente_id), payload.telefone.trim()]);
        } catch (errCli) {
          console.warn('[AVISO] Falha ao sincronizar telefone do cliente (PUT):', errCli.message);
        }
      }

      // Transição de Estoque quando o status muda
      if (statusAnterior !== novoStatus) {
        const itensEstoque = await identificarItensEstoque(payload.itens || pedidoExistente.itens, payload.itens_detalhados);
        if (itensEstoque.length > 0) {
          if (isStatusPendente(statusAnterior) && isStatusConcluido(novoStatus)) {
            await movimentarEstoquePedido(itensEstoque, 'CONVERTER_RESERVA_EM_BAIXA');
          } else if (isStatusPendente(statusAnterior) && novoStatus === 'CANCELADO') {
            await movimentarEstoquePedido(itensEstoque, 'LIBERAR_RESERVA');
          } else if (isStatusConcluido(statusAnterior) && isStatusPendente(novoStatus)) {
            await movimentarEstoquePedido(itensEstoque, 'ESTORNAR_BAIXA_PARA_RESERVA');
          } else if (isStatusConcluido(statusAnterior) && novoStatus === 'CANCELADO') {
            await movimentarEstoquePedido(itensEstoque, 'ESTORNAR_BAIXA_TOTAL');
          } else if (statusAnterior === 'CANCELADO' && isStatusPendente(novoStatus)) {
            await movimentarEstoquePedido(itensEstoque, 'RESERVAR');
          }
        }

        // Sincroniza título financeiro se pedido foi cancelado
        if (novoStatus === 'CANCELADO') {
          await run(
            "UPDATE financeiro_lancamentos SET status = 'CANCELADO', data_atualizacao = ? WHERE pedido_id = ? AND status = 'PENDENTE'",
            [agoraIso, idParam]
          );
        }
      }

      // Atualiza valor no título financeiro pendente caso o valor do pedido tenha mudado
      if (payload.valor_total !== undefined) {
        await run(
          "UPDATE financeiro_lancamentos SET valor = ?, data_atualizacao = ? WHERE pedido_id = ? AND status = 'PENDENTE'",
          [desformatarNumeroPtBr(payload.valor_total), agoraIso, idParam]
        );
      }

      await registrarLog({
        clienteId: pedidoExistente.cliente_id,
        clienteNome: pedidoExistente.cliente_nome,
        tipoAcao: 'ATUALIZAR_PEDIDO',
        camposAlterados: campos.map(c => c.split(' =')[0]),
        detalhes: `Pedido ${pedidoExistente.numero} atualizado (${statusAnterior} -> ${novoStatus})`,
        req
      }).catch(() => {});

      return responder(res, 200, { success: true, id: idParam, message: 'Pedido atualizado com sucesso.' });
    }

    // 4. DELETE: Excluir pedido e estornar reserva de estoque / lançamento financeiro pendente
    if (req.method === 'DELETE') {
      if (!idParam) {
        return responder(res, 400, { error: 'ID do pedido é obrigatório para exclusão.' });
      }

      const pedidoExistente = await get('SELECT * FROM pedidos WHERE id = ?', [idParam]);
      if (!pedidoExistente) {
        return responder(res, 404, { error: 'Pedido não encontrado.' });
      }

      if (isStatusPendente(pedidoExistente.status)) {
        const itensEstoque = await identificarItensEstoque(pedidoExistente.itens);
        if (itensEstoque.length > 0) {
          await movimentarEstoquePedido(itensEstoque, 'LIBERAR_RESERVA');
        }
      }

      await run("DELETE FROM financeiro_lancamentos WHERE pedido_id = ? AND status = 'PENDENTE'", [idParam]);
      await run('DELETE FROM pedidos WHERE id = ?', [idParam]);

      await registrarLog({
        clienteId: pedidoExistente.cliente_id,
        clienteNome: pedidoExistente.cliente_nome,
        tipoAcao: 'EXCLUIR_PEDIDO',
        camposAlterados: ['pedido_excluido'],
        detalhes: `Pedido ${pedidoExistente.numero} excluído do banco e reserva liberada`,
        req
      }).catch(() => {});

      return responder(res, 200, { success: true, id: idParam, message: 'Pedido excluído com sucesso.' });
    }

    return responder(res, 405, { error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO /api/pedidos]', err);
    return responder(res, 500, { error: 'Erro interno ao processar pedido: ' + err.message });
  }
}
