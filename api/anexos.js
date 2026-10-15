/**
 * Vercel Serverless Function: /api/anexos
 * Gestor de Arquivos, Fotos de Couros, Ordens de Serviço e PDFs
 * Armazenamento: Cloudflare R2 (com fallback local para desenvolvimento)
 */

import { query, get, run, registrarLog } from '../lib/db.js';
import { salvarArquivo, deletarArquivo, getStorageStatus } from '../lib/storage.js';

function responder(res, status, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(data);
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
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
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      return res.status(204).end();
    }
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
    });
    return res.end();
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const clienteIdParam = urlObj.searchParams.get('clienteId');
  const anexoIdParam = urlObj.searchParams.get('id');

  // 1. GET: Listar anexos ou obter status do storage
  if (req.method === 'GET') {
    if (urlObj.searchParams.get('status') === '1') {
      return responder(res, 200, { success: true, status: getStorageStatus() });
    }

    try {
      let anexos = [];
      if (clienteIdParam) {
        anexos = await query('SELECT * FROM arquivos_anexos WHERE cliente_id = ? ORDER BY id DESC', [clienteIdParam]);
      } else {
        anexos = await query('SELECT * FROM arquivos_anexos ORDER BY id DESC LIMIT 100');
      }
      return responder(res, 200, { success: true, count: anexos.length, anexos });
    } catch (err) {
      console.error('[ANEXOS GET ERRO]:', err);
      return responder(res, 500, { error: 'Falha ao buscar anexos: ' + err.message });
    }
  }

  // 2. POST: Upload de novo anexo (base64)
  if (req.method === 'POST') {
    try {
      const payload = await parseBody(req);
      const {
        bufferBase64,
        nomeOriginal,
        mimetype = 'application/octet-stream',
        tipoDocumento = 'FOTO_PRODUTO',
        clienteId = null,
        clienteNome = '',
        titulo = '',
        observacoes = ''
      } = payload;

      if (!bufferBase64 || !nomeOriginal) {
        return responder(res, 400, { error: 'bufferBase64 e nomeOriginal são obrigatórios.' });
      }

      // Converte Base64 para Buffer binário
      const cleanBase64 = bufferBase64.replace(/^data:.*?;base64,/, '');
      const fileBuffer = Buffer.from(cleanBase64, 'base64');

      // Determina a subpasta no R2
      let pasta = 'geral';
      if (tipoDocumento.includes('COURO') || tipoDocumento.includes('PRODUTO')) pasta = 'produtos_couros';
      else if (tipoDocumento.includes('ORDEM') || tipoDocumento.includes('SERVICO')) pasta = 'ordens_servico';
      else if (tipoDocumento.includes('NFE') || tipoDocumento.includes('PDF')) pasta = 'notas_fiscais';

      // Salva no Cloudflare R2 ou no fallback local
      const uploadResult = await salvarArquivo({
        buffer: fileBuffer,
        nomeOriginal: nomeOriginal,
        mimetype: mimetype,
        pasta: pasta
      });

      const agora = new Date().toISOString();

      // Grava no banco de dados
      const insertSql = `
        INSERT INTO arquivos_anexos (
          cliente_id, cliente_nome, tipo_documento, titulo,
          nome_arquivo, tamanho_bytes, mimetype, storage_provedor,
          storage_key, url, observacoes, data_upload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const insertResult = await run(insertSql, [
        clienteId,
        clienteNome || null,
        tipoDocumento,
        titulo || nomeOriginal,
        uploadResult.nomeArquivo,
        uploadResult.tamanho,
        uploadResult.mimetype,
        uploadResult.provedor,
        uploadResult.key,
        uploadResult.url,
        observacoes || null,
        agora
      ]);

      const novoId = insertResult.lastInsertRowid || insertResult.id;

      // Log de auditoria
      await registrarLog({
        clienteId: clienteId || null,
        clienteNome: clienteNome || 'Sistema',
        tipoAcao: 'UPLOAD_ARQUIVO',
        camposAlterados: ['arquivo', uploadResult.provedor],
        detalhes: `Upload [${tipoDocumento}] "${nomeOriginal}" (${(uploadResult.tamanho / 1024).toFixed(1)} KB) no ${uploadResult.provedor}`,
        req: req
      });

      return responder(res, 201, {
        success: true,
        id: novoId,
        anexo: {
          id: novoId,
          cliente_id: clienteId,
          cliente_nome: clienteNome,
          tipo_documento: tipoDocumento,
          titulo: titulo || nomeOriginal,
          nome_arquivo: uploadResult.nomeArquivo,
          tamanho_bytes: uploadResult.tamanho,
          mimetype: uploadResult.mimetype,
          storage_provedor: uploadResult.provedor,
          storage_key: uploadResult.key,
          url: uploadResult.url,
          observacoes: observacoes,
          data_upload: agora
        }
      });
    } catch (err) {
      console.error('[ANEXOS POST ERRO]:', err);
      return responder(res, 500, { error: 'Erro ao processar upload: ' + err.message });
    }
  }

  // 3. DELETE: Deletar anexo
  if (req.method === 'DELETE') {
    const id = anexoIdParam || (await parseBody(req))?.id;
    if (!id) {
      return responder(res, 400, { error: 'ID do anexo é obrigatório para exclusão.' });
    }

    try {
      const anexo = await get('SELECT * FROM arquivos_anexos WHERE id = ?', [id]);
      if (!anexo) {
        return responder(res, 404, { error: 'Anexo não encontrado.' });
      }

      // Deleta do Cloudflare R2 ou disco local
      await deletarArquivo(anexo.storage_key);

      // Remove do banco
      await run('DELETE FROM arquivos_anexos WHERE id = ?', [id]);

      // Registra log
      await registrarLog({
        clienteId: anexo.cliente_id,
        clienteNome: anexo.cliente_nome,
        tipoAcao: 'EXCLUSAO_ARQUIVO',
        camposAlterados: ['arquivo_deletado'],
        detalhes: `Exclusão de anexo "${anexo.nome_arquivo}" do storage ${anexo.storage_provedor}`,
        req: req
      });

      return responder(res, 200, { success: true, message: 'Anexo excluído com sucesso.' });
    } catch (err) {
      console.error('[ANEXOS DELETE ERRO]:', err);
      return responder(res, 500, { error: 'Erro ao excluir anexo: ' + err.message });
    }
  }

  return responder(res, 405, { error: 'Método não permitido.' });
}
