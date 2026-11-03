/**
 * Vercel Serverless Function & Node.js Handler: /api/sistema/manutencao
 * Rotinas de Manutenção: VACUUM (Otimização) e Cold Storage de Logs no Cloudflare R2
 * Autor: Gustavo Rosa Informática / Mis Sueños ERP
 */

import { query, run, modoAtivo } from '../lib/db.js';
import { salvarArquivo, getStorageStatus } from '../lib/storage.js';

function parseDataBr(str) {
  if (!str) return new Date(0);
  const m = String(str).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

function escCsv(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
  return `"${s}"`;
}

/**
 * Executa VACUUM no banco de dados ativo
 */
export async function otimizarBanco() {
  const inicio = Date.now();

  let bytesAntes = 0;
  try {
    const pc = await query('PRAGMA page_count');
    const ps = await query('PRAGMA page_size');
    const pCount = Number(pc?.[0]?.page_count || Object.values(pc?.[0] || {})[0] || 0);
    const pSize = Number(ps?.[0]?.page_size || Object.values(ps?.[0] || {})[0] || 4096);
    bytesAntes = pCount * pSize;
  } catch {}

  // Executa VACUUM
  try {
    await run('VACUUM');
  } catch (err) {
    // Se o banco for somente-leitura ou não suportar VACUUM direto
    console.warn('[VACUUM AVISO]', err.message);
  }

  let bytesDepois = bytesAntes;
  try {
    const pc = await query('PRAGMA page_count');
    const ps = await query('PRAGMA page_size');
    const pCount = Number(pc?.[0]?.page_count || Object.values(pc?.[0] || {})[0] || 0);
    const pSize = Number(ps?.[0]?.page_size || Object.values(ps?.[0] || {})[0] || 4096);
    bytesDepois = pCount * pSize;
  } catch {}

  const tempoMs = Date.now() - inicio;
  const bytesLiberados = Math.max(0, bytesAntes - bytesDepois);

  return {
    sucesso: true,
    mensagem: 'Banco de dados desfragmentado e otimizado com sucesso via VACUUM.',
    tempo_execucao_ms: tempoMs,
    bytes_antes: bytesAntes,
    bytes_depois: bytesDepois,
    bytes_liberados: bytesLiberados,
    ambiente: modoAtivo()
  };
}

/**
 * Expurgar logs com mais de N dias, enviando para o Cloudflare R2 (Cold Storage) antes de apagar
 */
export async function arquivarELimparLogs({ diasRetencao = 90, forcarTodos = false } = {}) {
  const agora = new Date();
  const limiteData = new Date(agora.getTime() - diasRetencao * 24 * 60 * 60 * 1000);

  // 1. Busca todos os logs
  const todosLogs = await query('SELECT * FROM logs_auditoria ORDER BY id ASC');
  if (!todosLogs || todosLogs.length === 0) {
    return {
      sucesso: true,
      logs_arquivados: 0,
      mensagem: 'A tabela de logs de auditoria já está vazia. Nenhuma ação necessária.'
    };
  }

  // 2. Filtra os logs a serem arquivados
  const logsParaArquivar = todosLogs.filter(log => {
    if (forcarTodos) return true;
    const dt = parseDataBr(log.data_hora);
    return dt < limiteData;
  });

  if (logsParaArquivar.length === 0) {
    return {
      sucesso: true,
      logs_arquivados: 0,
      mensagem: `Nenhum log com mais de ${diasRetencao} dias encontrado para expurgo.`
    };
  }

  // 3. Monta o arquivo CSV com BOM UTF-8
  const cabecalho = 'ID;Cliente_ID;Cliente_Nome;Tipo_Acao;Campos_Alterados;Detalhes;IP_Origem;Data_Hora\r\n';
  const linhas = logsParaArquivar.map(l => {
    return [
      l.id,
      l.cliente_id || '',
      escCsv(l.cliente_nome),
      escCsv(l.tipo_acao),
      escCsv(l.campos_alterados),
      escCsv(l.detalhes),
      escCsv(l.ip_origem),
      escCsv(l.data_hora)
    ].join(';');
  }).join('\r\n');

  const csvCompleto = '\uFEFF' + cabecalho + linhas;
  const bufferCsv = Buffer.from(csvCompleto, 'utf-8');

  // 4. Envia para o Cloudflare R2 / Fallback Local
  const dataCorteStr = limiteData.toISOString().slice(0, 10);
  const nomeArquivo = `logs_auditoria_ate_${dataCorteStr}_${Date.now()}.csv`;

  let resultadoStorage;
  try {
    resultadoStorage = await salvarArquivo({
      buffer: bufferCsv,
      nomeOriginal: nomeArquivo,
      mimetype: 'text/csv; charset=utf-8',
      pasta: 'backups/logs'
    });
  } catch (err) {
    console.error('[ERRO STORAGE COLD STORAGE]', err);
    throw new Error('Falha ao enviar backup para o Cloudflare R2 / Armazenamento: ' + err.message);
  }

  // 5. Exclui os registros do banco de dados com segurança
  const idsParaDeletar = logsParaArquivar.map(l => l.id);
  // Deleta em lotes para não estourar limite de parâmetros SQL
  const LOTE_MAX = 500;
  let totalDeletados = 0;

  for (let i = 0; i < idsParaDeletar.length; i += LOTE_MAX) {
    const lote = idsParaDeletar.slice(i, i + LOTE_MAX);
    const placeholders = lote.map(() => '?').join(',');
    const delRes = await run(`DELETE FROM logs_auditoria WHERE id IN (${placeholders})`, lote);
    totalDeletados += delRes.rowsAffected || lote.length;
  }

  // 6. Executa VACUUM para devolver as páginas livres
  let otimizacaoRes = null;
  try {
    otimizacaoRes = await otimizarBanco();
  } catch {}

  const storageStatus = getStorageStatus();

  return {
    sucesso: true,
    logs_arquivados: totalDeletados,
    data_corte: dataCorteStr,
    arquivo_backup: {
      nome: nomeArquivo,
      url: resultadoStorage.url,
      chave: resultadoStorage.chave,
      tamanho_bytes: bufferCsv.length,
      provedor: storageStatus.provedor
    },
    otimizacao: otimizacaoRes,
    mensagem: `${totalDeletados} registros de auditoria foram salvos com segurança no Cloudflare R2 e liberados do banco de dados.`
  };
}

export default async function handlerSistemaManutencao(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'Método não permitido. Use POST.' }));
  }

  // Lê o corpo JSON da requisição
  let body = {};
  try {
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const dataStr = Buffer.concat(buffers).toString('utf-8');
    if (dataStr) body = JSON.parse(dataStr);
  } catch {}

  const url = new URL(req.url, `http://localhost:3000`);
  const acao = body.acao || url.searchParams.get('acao') || (url.pathname.includes('otimizar') ? 'otimizar' : 'limpar_logs');

  try {
    if (acao === 'otimizar') {
      const resOtimizar = await otimizarBanco();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(resOtimizar));
    }

    if (acao === 'limpar_logs' || acao === 'cold_storage') {
      const diasRetencao = Number(body.dias_retencao || 90);
      const forcarTodos = Boolean(body.forcar_todos);
      const resLimpar = await arquivarELimparLogs({ diasRetencao, forcarTodos });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(resLimpar));
    }

    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'Ação não reconhecida. Use "otimizar" ou "limpar_logs".' }));
  } catch (err) {
    console.error('[ERRO MANUTENCAO API]', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'Falha na rotina de manutenção', detalhes: err.message }));
  }
}
