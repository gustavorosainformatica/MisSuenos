/**
 * Vercel Serverless Function & REST API: /api/estoque
 * Módulo Universal de Estoque & Ficha Kardex Multi-Ramo
 * Autor: Gustavo Rosa Informática / Mis Sueños ERP
 * 
 * Funcionalidades:
 * - POST /api/estoque/movimentar : Registro de entradas e saídas com cálculo atômico de saldos
 * - GET  /api/estoque/kardex     : Extrato histórico cronológico por produto
 * - GET  /api/estoque/motivos    : Catálogo de motivos universais (comércio, indústria, locação)
 */

import { query, get, run, registrarLog } from '../lib/db.js';
import { validarTokenSessao } from '../lib/auth.js';

// Catálogo de Motivos Universais para múltiplos modelos de negócio
export const MOTIVOS_UNIVERSAIS = {
  ENTRADA: [
    { id: 'COMPRA_FORNECEDOR', label: 'Compra de Fornecedor / NF-e', categoria: 'Fiscal / Suprimentos' },
    { id: 'INVENTARIO_INICIAL', label: 'Inventário Inicial / Balanço Positivo', categoria: 'Ajuste Físico' },
    { id: 'DEVOLUCAO_CLIENTE', label: 'Devolução de Cliente / Estorno de Pedido', categoria: 'Comercial' },
    { id: 'RETORNO_LOCACAO', label: 'Retorno de Locação / Fim de Contrato', categoria: 'Contratos / Ativos' },
    { id: 'APROVEITAMENTO_CORTE', label: 'Aproveitamento de Sobras / Retalhos Úteis', categoria: 'Produção / Oficina' },
    { id: 'OUTRA_ENTRADA', label: 'Outra Entrada Justificada', categoria: 'Geral' }
  ],
  SAIDA: [
    { id: 'VENDA_PEDIDO', label: 'Venda Faturada / Saída por Pedido', categoria: 'Comercial' },
    { id: 'AVARIA_DESCARTE', label: 'Avaria / Pele Danificada / Quebra / Descarte', categoria: 'Perdas' },
    { id: 'SAIDA_LOCACAO', label: 'Saída para Locação / Comodato em Cliente', categoria: 'Contratos / Ativos' },
    { id: 'AMOSTRA_DEMONSTRACAO', label: 'Amostra Grátis / Demonstração Comercial', categoria: 'Comercial' },
    { id: 'USO_CONSUMO_INTERNO', label: 'Uso e Consumo Interno / Manutenção / Oficina', categoria: 'Operacional' },
    { id: 'AJUSTE_BALANCO_NEGATIVO', label: 'Ajuste de Balanço Negativo (Perda / Quebra)', categoria: 'Ajuste Físico' },
    { id: 'OUTRA_SAIDA', label: 'Outra Saída Justificada', categoria: 'Geral' }
  ]
};

function responder(res, status, data, headers = {}) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    if (headers) {
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    }
    return res.status(status).json(data);
  }

  const defaultHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...headers
  };

  res.writeHead(status, defaultHeaders);
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
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
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return res.status(204).end();
    }
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const urlObj = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
  const pathname = urlObj.pathname;
  const method = req.method;

  // Identificação do Operador
  let operador = null;
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const sessao = validarTokenSessao(token);
    if (sessao) {
      operador = await get('SELECT id, nome, login, papel FROM usuarios WHERE id = ?', [sessao.usuarioId]);
    }
  }

  const operadorNome = operador ? `${operador.nome} (${operador.login})` : 'Operador do Sistema';
  const operadorId = operador ? operador.id : null;

  try {
    // =========================================================================
    // ROTA 1: GET /api/estoque/motivos
    // Retorna a lista de motivos universais cadastrados para os selects da UI
    // =========================================================================
    if ((pathname === '/api/estoque/motivos' || urlObj.searchParams.get('acao') === 'motivos') && method === 'GET') {
      return responder(res, 200, {
        success: true,
        motivos: MOTIVOS_UNIVERSAIS
      });
    }

    // =========================================================================
    // ROTA 2: GET /api/estoque/kardex/:produto_id ou ?produto_id=X
    // Retorna o extrato histórico completo (Ficha Kardex) do produto
    // =========================================================================
    if ((pathname.startsWith('/api/estoque/kardex') || pathname === '/api/estoque') && method === 'GET') {
      // Extrai produto_id do caminho ou query param
      let produtoId = urlObj.searchParams.get('produto_id');
      if (!produtoId && pathname.startsWith('/api/estoque/kardex/')) {
        const partes = pathname.split('/');
        produtoId = partes[partes.length - 1];
      }

      if (!produtoId || isNaN(Number(produtoId))) {
        return responder(res, 400, { error: 'Parâmetro produto_id é obrigatório e deve ser numérico.' });
      }

      const produto = await get(`
        SELECT id, codigo_sku, nome, categoria, unidade_medida, preco_custo, preco_venda, estoque_atual, estoque_minimo, ncm
        FROM produtos WHERE id = ?
      `, [produtoId]);

      if (!produto) {
        return responder(res, 404, { error: 'Produto não encontrado no catálogo.' });
      }

      // Filtros opcionais de data
      const dataInicio = urlObj.searchParams.get('inicio');
      const dataFim = urlObj.searchParams.get('fim');
      const limite = parseInt(urlObj.searchParams.get('limite') || '100', 10);

      let sqlMov = `
        SELECT id, produto_id, tipo, origem, motivo, quantidade, saldo_anterior, saldo_posterior,
               custo_unitario, documento_referencia, observacoes, operador_nome, data_movimentacao
        FROM estoque_movimentacoes
        WHERE produto_id = ?
      `;
      const params = [produtoId];

      if (dataInicio) {
        sqlMov += ` AND data_movimentacao >= ?`;
        params.push(`${dataInicio} 00:00:00`);
      }
      if (dataFim) {
        sqlMov += ` AND data_movimentacao <= ?`;
        params.push(`${dataFim} 23:59:59`);
      }

      sqlMov += ` ORDER BY data_movimentacao DESC, id DESC LIMIT ?`;
      params.push(limite);

      const movimentacoes = await query(sqlMov, params);

      // Totalizadores de Entradas e Saídas acumuladas
      const totais = await get(`
        SELECT 
          COALESCE(SUM(CASE WHEN tipo = 'ENTRADA' THEN quantidade ELSE 0 END), 0) as total_entradas,
          COALESCE(SUM(CASE WHEN tipo = 'SAIDA' THEN quantidade ELSE 0 END), 0) as total_saidas,
          COUNT(id) as total_movimentacoes
        FROM estoque_movimentacoes
        WHERE produto_id = ?
      `, [produtoId]);

      return responder(res, 200, {
        success: true,
        produto,
        totais: {
          total_entradas: totais?.total_entradas || 0,
          total_saidas: totais?.total_saidas || 0,
          total_registros: totais?.total_movimentacoes || 0
        },
        movimentacoes
      });
    }

    // =========================================================================
    // ROTA 3: POST /api/estoque/movimentar (ou /api/estoque)
    // Realiza o ajuste manual ou transacional de estoque
    // =========================================================================
    if ((pathname === '/api/estoque/movimentar' || pathname === '/api/estoque') && method === 'POST') {
      const body = await parseBody(req);
      const {
        produto_id,
        tipo,
        origem = 'AJUSTE_MANUAL',
        motivo,
        quantidade,
        documento_referencia = '',
        observacoes = '',
        custo_unitario
      } = body;

      // 1. Validações de Entrada
      if (!produto_id) {
        return responder(res, 400, { error: 'O campo produto_id é obrigatório.' });
      }

      const tipoNormalizado = String(tipo || '').toUpperCase().trim();
      if (tipoNormalizado !== 'ENTRADA' && tipoNormalizado !== 'SAIDA') {
        return responder(res, 400, { error: "O campo tipo deve ser 'ENTRADA' ou 'SAIDA'." });
      }

      const qtdNum = Number(quantidade);
      if (isNaN(qtdNum) || qtdNum <= 0) {
        return responder(res, 400, { error: 'A quantidade movimentada deve ser um número maior que zero.' });
      }

      if (!motivo || String(motivo).trim() === '') {
        return responder(res, 400, { error: 'O motivo da movimentação é obrigatório para fins de auditoria.' });
      }

      // 2. Consulta produto para validar existência e capturar saldo atual
      const produto = await get('SELECT id, codigo_sku, nome, preco_custo, estoque_atual FROM produtos WHERE id = ?', [produto_id]);
      if (!produto) {
        return responder(res, 404, { error: 'Produto informado não existe no catálogo.' });
      }

      const saldoAnterior = Number(produto.estoque_atual) || 0;
      let saldoPosterior = 0;

      // 3. Regra de Negócio: Cálculo de Saldo e Bloqueio de Estoque Negativo
      if (tipoNormalizado === 'ENTRADA') {
        saldoPosterior = saldoAnterior + qtdNum;
      } else {
        if (qtdNum > saldoAnterior) {
          return responder(res, 400, {
            error: `Estoque insuficiente: O saldo atual deste item é ${saldoAnterior}, mas você tentou baixar ${qtdNum}.`,
            saldo_atual: saldoAnterior,
            tentativa_saida: qtdNum
          });
        }
        saldoPosterior = saldoAnterior - qtdNum;
      }

      const custoFinal = (custo_unitario !== undefined && custo_unitario !== null) ? Number(custo_unitario) : (produto.preco_custo || 0);

      // 4. Gravação Atômica: Atualização do Produto + Registro na Ficha Kardex
      await run(`
        UPDATE produtos 
        SET estoque_atual = ?, data_atualizacao = datetime('now', 'localtime')
        WHERE id = ?
      `, [saldoPosterior, produto_id]);

      const insertResult = await run(`
        INSERT INTO estoque_movimentacoes (
          produto_id, tipo, origem, motivo, quantidade,
          saldo_anterior, saldo_posterior, custo_unitario,
          documento_referencia, observacoes, operador_id, operador_nome, data_movimentacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      `, [
        produto_id,
        tipoNormalizado,
        origem,
        motivo,
        qtdNum,
        saldoAnterior,
        saldoPosterior,
        custoFinal,
        documento_referencia || null,
        observacoes || null,
        operadorId,
        operadorNome
      ]);

      // Registro de Auditoria Global
      await registrarLog({
        clienteId: null,
        clienteNome: `Estoque: ${produto.nome} (${produto.codigo_sku})`,
        tipoAcao: `ESTOQUE_${tipoNormalizado}`,
        camposAlterados: `estoque_atual: ${saldoAnterior} -> ${saldoPosterior} (${tipoNormalizado === 'ENTRADA' ? '+' : '-'}${qtdNum})`,
        detalhes: `Motivo: ${motivo} | Ref: ${documento_referencia || 'N/A'} | Obs: ${observacoes || 'N/A'}`,
        req
      });

      return responder(res, 201, {
        success: true,
        mensagem: `Movimentação de ${tipoNormalizado} registrada com sucesso.`,
        produto: {
          id: produto.id,
          codigo_sku: produto.codigo_sku,
          nome: produto.nome
        },
        movimentacao: {
          id: insertResult?.lastInsertRowid || null,
          tipo: tipoNormalizado,
          origem,
          motivo,
          quantidade: qtdNum,
          saldo_anterior: saldoAnterior,
          saldo_posterior: saldoPosterior,
          documento_referencia,
          operador: operadorNome
        }
      });
    }

    // Endpoint não mapeado
    return responder(res, 404, { error: 'Rota de estoque não encontrada', pathname });

  } catch (err) {
    console.error('[ERRO API ESTOQUE]', err);
    return responder(res, 500, { error: 'Falha no processamento de estoque: ' + err.message });
  }
}
