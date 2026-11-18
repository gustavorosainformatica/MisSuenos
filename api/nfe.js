/** Gateway fiscal WLG para NF-e modelo 55, restrito a homologação. */

import { query, get, run } from '../lib/db.js';
import crypto from 'node:crypto';
import { formatarChaveAcesso } from '../lib/fiscal_hub.js';
import { validarPayloadNfeWlg, emitirNfeWlg, consultarOperacaoWlg, obterArtefatoNfeWlg, obterConfiguracaoWlg } from '../lib/wlg.js';

function responder(res, status, data, contentType = 'application/json; charset=utf-8') {
  if (typeof res.status === 'function' && typeof res.json === 'function' && contentType.startsWith('application/json')) {
    return res.status(status).json(data);
  }
  if (typeof res.writeHead === 'function') {
    res.writeHead(status, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end(typeof data === 'string' ? data : JSON.stringify(data));
  }
  return res;
}

function responderBinario(res, buffer, contentType, filename) {
  const headers = {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'private, no-store, max-age=0'
  };
  if (typeof res.status === 'function' && typeof res.send === 'function') {
    for (const [nome, valor] of Object.entries(headers)) res.setHeader?.(nome, valor);
    return res.status(200).send(buffer);
  }
  res.writeHead(200, headers);
  return res.end(buffer);
}

function parseUrl(req) {
  try {
    const base = `http://${req.headers?.host || 'localhost'}`;
    return new URL(req.url || '/', base);
  } catch {
    return new URL('/', 'http://localhost');
  }
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
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      return res.status(204).end();
    }
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    return res.end();
  }

  const url = parseUrl(req);
  const pathname = url.pathname;

  // Extração de parâmetros de rota amigável (/api/nfe/danfe/:chave ou /api/nfe/xml/:chave)
  const matchDanfe = pathname.match(/^\/api\/nfe\/danfe\/([0-9a-zA-Z]+)$/);
  const matchXml = pathname.match(/^\/api\/nfe\/xml\/([0-9a-zA-Z]+)$/);
  const matchStatus = pathname.match(/^\/api\/nfe\/status\/([0-9a-zA-Z]+)$/);

  const acao = url.searchParams.get('acao') || req.query?.acao;

  try {
    // Rotas legadas nunca podem fabricar XML, DANFE, protocolo ou dados do emitente.
    // Os caminhos por chave só servem artefatos associados a uma autorização WLG confirmada.
    const chaveConsulta = String(matchDanfe?.[1] || matchXml?.[1] || matchStatus?.[1] || url.searchParams.get('chave') || req.query?.chave || '').replace(/\D/g, '');
    if ((matchDanfe || acao === 'danfe') && req.method === 'GET') {
      if (!/^\d{44}$/.test(chaveConsulta)) return responder(res, 400, { error: 'Chave de acesso inválida.' });
      const operacao = await get("SELECT id FROM fiscal_operacoes_wlg WHERE chave_nfe = ? AND status = 'AUTORIZADO'", [chaveConsulta]);
      if (!operacao) return responder(res, 404, { error: 'DANFE oficial não encontrado. O sistema não gera DANFE local para documentos legados.' });
      const arquivo = await obterArtefatoNfeWlg(chaveConsulta, 'danfe');
      return responderBinario(res, arquivo.buffer, arquivo.contentType, `nfe-${operacao.id}.pdf`);
    }

    if ((matchXml || acao === 'xml') && req.method === 'GET') {
      if (!/^\d{44}$/.test(chaveConsulta)) return responder(res, 400, { error: 'Chave de acesso inválida.' });
      const operacao = await get("SELECT id FROM fiscal_operacoes_wlg WHERE chave_nfe = ? AND status = 'AUTORIZADO'", [chaveConsulta]);
      if (!operacao) return responder(res, 404, { error: 'XML oficial não encontrado. O sistema não fabrica XML para documentos legados.' });
      const arquivo = await obterArtefatoNfeWlg(chaveConsulta, 'xml');
      return responderBinario(res, arquivo.buffer, arquivo.contentType, `nfe-${operacao.id}.xml`);
    }

    if ((matchStatus || acao === 'status') && req.method === 'GET') {
      if (!/^\d{44}$/.test(chaveConsulta)) return responder(res, 400, { error: 'Chave de acesso inválida.' });
      const operacao = await get('SELECT id, status, codigo_status, chave_nfe, protocolo, data_autorizacao FROM fiscal_operacoes_wlg WHERE chave_nfe = ?', [chaveConsulta]);
      if (!operacao) return responder(res, 404, { error: 'Operação WLG não encontrada para esta chave.' });
      return responder(res, 200, { success: true, documento: { id: operacao.id, chaveAcesso: operacao.chave_nfe, status: operacao.status, codigoStatus: operacao.codigo_status, protocolo: operacao.protocolo, dataAutorizacao: operacao.data_autorizacao } });
    }

    if (acao === 'wlg_emitir' && req.method === 'POST') {
      const body = await parseBody(req);
      const chaveCliente = String(body.chaveIdempotencia || '').trim();
      if (!/^[a-zA-Z0-9_-]{16,200}$/.test(chaveCliente) || !body.documentoWlg || typeof body.documentoWlg !== 'object') {
        return responder(res, 400, { error: 'Informe chaveIdempotencia (16 a 200 caracteres) e documentoWlg.' });
      }
      const configWlg = obterConfiguracaoWlg();
      if (configWlg.ambiente !== 2) return responder(res, 409, { error: 'Este endpoint aceita somente homologação (ambiente 2).' });
      try { validarPayloadNfeWlg(body.documentoWlg); }
      catch (error) { return responder(res, 400, { error: error.message }); }

      const chaveHash = crypto.createHash('sha256').update(chaveCliente).digest('hex');
      const idInterno = crypto.randomUUID();
      await run(`INSERT OR IGNORE INTO fiscal_operacoes_wlg
        (id, chave_idempotencia_hash, ambiente, status) VALUES (?, ?, 2, 'PENDENTE')`, [idInterno, chaveHash]);
      const operacaoExistente = await get('SELECT id, status, operation_id FROM fiscal_operacoes_wlg WHERE chave_idempotencia_hash = ?', [chaveHash]);
      if (!operacaoExistente) return responder(res, 500, { error: 'Não foi possível registrar a operação fiscal.' });
      if (operacaoExistente.id !== idInterno) {
        return responder(res, 200, { success: true, reutilizada: true, operacaoId: operacaoExistente.id, status: operacaoExistente.status });
      }

      try {
        const resultado = await emitirNfeWlg(body.documentoWlg);
        const status = resultado.status === 'PROCESSANDO' ? 'PROCESSANDO' : 'PENDENTE_CONFIRMACAO';
        await run(`UPDATE fiscal_operacoes_wlg SET operation_id = ?, status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`, [resultado.operationId, status, idInterno]);
        return responder(res, 202, { success: true, operacaoId: idInterno, status });
      } catch (error) {
        // Falha de rede pode ocorrer após aceitação externa; não repetir automaticamente.
        const inconclusivo = error?.code === 'WLG_ENVIO_INCONCLUSIVO';
        const status = inconclusivo ? 'PENDENTE_CONFIRMACAO' : 'ERRO_ENVIO';
        await run(`UPDATE fiscal_operacoes_wlg SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`, [status, idInterno]);
        return responder(res, 502, {
          error: inconclusivo ? 'Resultado do envio inconclusivo. Consulte a operação antes de tentar novamente.' : 'A WLG não aceitou a emissão. Revise a configuração e o documento.',
          operacaoId: idInterno,
          status
        });
      }
    }

    if (acao === 'wlg_consultar' && req.method === 'GET') {
      const idInterno = String(url.searchParams.get('operacaoId') || req.query?.operacaoId || '').trim();
      const operacao = await get('SELECT * FROM fiscal_operacoes_wlg WHERE id = ?', [idInterno]);
      if (!operacao) return responder(res, 404, { error: 'Operação fiscal não encontrada.' });
      if (!operacao.operation_id) {
        return responder(res, 202, { success: true, operacaoId: operacao.id, status: operacao.status });
      }

      const resultado = await consultarOperacaoWlg(operacao.operation_id);
      let status = 'PROCESSANDO';
      let chaveNfe = null;
      let protocolo = null;
      let dataAutorizacao = null;
      if (resultado.status === 'ERRO') status = 'REJEITADO';
      if (resultado.status === 'SUCCESSO') {
        if (resultado.codigoStatus === 100 && /^\d{44}$/.test(String(resultado.chaveNfe || ''))) {
          status = 'AUTORIZADO';
          chaveNfe = resultado.chaveNfe;
          protocolo = resultado.protocolo;
          dataAutorizacao = resultado.dataAutorizacao || resultado.dataProtocolo;
        } else {
          status = 'ERRO_CONSULTA';
        }
      }
      await run(`UPDATE fiscal_operacoes_wlg SET status = ?, codigo_status = ?, chave_nfe = ?, protocolo = ?, data_autorizacao = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`, [
        status, resultado.codigoStatus, chaveNfe, protocolo, dataAutorizacao, operacao.id
      ]);
      return responder(res, 200, {
        success: true,
        operacaoId: operacao.id,
        status,
        codigoStatus: resultado.codigoStatus,
        chaveNfe,
        protocolo,
        dataAutorizacao,
        motivo: status === 'REJEITADO' ? 'A SEFAZ rejeitou a operação. Consulte o código de status no portal WLG.' : null
      });
    }

    if (acao === 'wlg_artefato' && req.method === 'GET') {
      const idInterno = String(url.searchParams.get('operacaoId') || '').trim();
      const tipoArtefato = String(url.searchParams.get('tipo') || '').toLowerCase();
      const operacao = await get('SELECT id, status, chave_nfe FROM fiscal_operacoes_wlg WHERE id = ?', [idInterno]);
      if (!operacao) return responder(res, 404, { error: 'Operação fiscal não encontrada.' });
      if (operacao.status !== 'AUTORIZADO' || !operacao.chave_nfe) {
        return responder(res, 409, { error: 'O artefato só fica disponível após autorização confirmada pela WLG.' });
      }
      const arquivo = await obterArtefatoNfeWlg(operacao.chave_nfe, tipoArtefato);
      const filename = `nfe-${operacao.id}.${arquivo.extensao}`;
      return responderBinario(res, arquivo.buffer, arquivo.contentType, filename);
    }

    if (req.method === 'POST') {
      return responder(res, 410, {
        error: 'A rota legada de emissão fiscal está desativada. A emissão NF-e deve usar o fluxo WLG assíncrono de homologação; NFS-e não está habilitada neste adapter.'
      });
    }

    // =========================================================================
    // 4. GET: LISTAGEM DE DOCUMENTOS FISCAIS EMITIDOS
    // =========================================================================
    if (req.method === 'GET') {
      const statusFiltro = String(url.searchParams.get('status') || '').toUpperCase();
      let sql = 'SELECT id, tipo, serie, numero, chave_acesso, pedido_id, status, motivo_status, protocolo_autorizacao, danfe_pdf_url, emitido_em FROM fiscal_documentos';
      if (statusFiltro === 'LEGADO_NAO_VERIFICADO') sql += ' WHERE 1 = 1';
      else if (statusFiltro) sql += ' WHERE 1 = 0';
      sql += ' ORDER BY id DESC LIMIT 100';

      const docs = await query(sql);
      let sqlOperacoes = 'SELECT id, status, codigo_status, chave_nfe, protocolo, data_autorizacao, criado_em, atualizado_em FROM fiscal_operacoes_wlg';
      const paramsOperacoes = [];
      if (statusFiltro && statusFiltro !== 'LEGADO_NAO_VERIFICADO') {
        sqlOperacoes += ' WHERE status = ?';
        paramsOperacoes.push(statusFiltro.toUpperCase());
      } else if (statusFiltro === 'LEGADO_NAO_VERIFICADO') {
        sqlOperacoes += ' WHERE 1 = 0';
      }
      sqlOperacoes += ' ORDER BY atualizado_em DESC LIMIT 100';
      const operacoesWlg = await query(sqlOperacoes, paramsOperacoes);
      const documentosLegados = docs.map(d => ({
        ...d,
        status: 'LEGADO_NAO_VERIFICADO',
        motivo_status: 'Documento legado sem confirmação verificável pela integração WLG.',
        chaveFormatada: formatarChaveAcesso(d.chave_acesso),
        links: null
      }));
      const documentosWlg = operacoesWlg.map(op => ({
        id: op.id,
        tipo: 'NFE_WLG',
        serie: null,
        numero: null,
        chave_acesso: op.chave_nfe,
        pedido_id: null,
        status: op.status,
        codigo_status: op.codigo_status,
        protocolo_autorizacao: op.protocolo,
        emitido_em: op.data_autorizacao || op.atualizado_em || op.criado_em,
        chaveFormatada: formatarChaveAcesso(op.chave_nfe),
        links: op.status === 'AUTORIZADO' && op.chave_nfe ? {
          danfe: `/api/nfe/danfe/${op.chave_nfe}`,
          xml: `/api/nfe/xml/${op.chave_nfe}`
        } : null
      }));
      const documentos = [...documentosWlg, ...documentosLegados]
        .sort((a, b) => String(b.emitido_em || '').localeCompare(String(a.emitido_em || '')))
        .slice(0, 100);
      return responder(res, 200, {
        success: true,
        total: documentos.length,
        documentos
      });
    }

    // =========================================================================
    return responder(res, 405, { error: 'Método não permitido.' });

  } catch (err) {
    console.error('[API NFE ERRO]', err);
    return responder(res, 500, { error: 'Erro no processamento fiscal: ' + err.message });
  }
}
