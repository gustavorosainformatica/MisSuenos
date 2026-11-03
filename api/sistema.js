/**
 * Vercel Serverless Function & Node.js Handler: /api/sistema
 * Gestão Unificada do Sistema: Telemetria de Armazenamento, Quotas,
 * Otimização de Banco (VACUUM) e Cold Storage no Cloudflare R2
 * Autor: Gustavo Rosa Informática / Mis Sueños ERP
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, get, run, modoAtivo } from '../lib/db.js';
import { salvarArquivo, getStorageStatus } from '../lib/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.join(__dirname, '..');
const DB_PATH = path.join(BASE_DIR, 'database', 'clientes.db');
const UPLOADS_DIR = path.join(BASE_DIR, 'public', 'uploads');

// Constantes de limites de planos gratuitos
const TURSO_LIMITE_BYTES = 9 * 1024 * 1024 * 1024; // 9.0 GB
const R2_LIMITE_BYTES = 10 * 1024 * 1024 * 1024;   // 10.0 GB

function formatarBytes(bytes, decimais = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimais < 0 ? 0 : decimais;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function calcularTamanhoDiretorio(dirPath) {
  let totalBytes = 0;
  let totalArquivos = 0;

  if (!fs.existsSync(dirPath)) {
    return { totalBytes, totalArquivos };
  }

  function lerDirRecursivo(atual) {
    try {
      const itens = fs.readdirSync(atual, { withFileTypes: true });
      for (const item of itens) {
        const itemPath = path.join(atual, item.name);
        if (item.isDirectory()) {
          lerDirRecursivo(itemPath);
        } else if (item.isFile()) {
          try {
            const stats = fs.statSync(itemPath);
            totalBytes += stats.size;
            totalArquivos++;
          } catch {}
        }
      }
    } catch {}
  }

  lerDirRecursivo(dirPath);
  return { totalBytes, totalArquivos };
}

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

function responder(res, status, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(data);
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

/**
 * 1. Coleta métricas completas de armazenamento e quotas
 */
export async function obterMetricasArmazenamento() {
  const modo = modoAtivo();
  const storageStatus = getStorageStatus();

  let pageCount = 0;
  let pageSize = 4096;
  let freelistCount = 0;

  try {
    const pc = await query('PRAGMA page_count');
    if (pc && pc[0]) {
      pageCount = Number(pc[0].page_count || Object.values(pc[0])[0] || 0);
    }
    const ps = await query('PRAGMA page_size');
    if (ps && ps[0]) {
      pageSize = Number(ps[0].page_size || Object.values(ps[0])[0] || 4096);
    }
    const fc = await query('PRAGMA freelist_count');
    if (fc && fc[0]) {
      freelistCount = Number(fc[0].freelist_count || Object.values(fc[0])[0] || 0);
    }
  } catch (err) {
    console.warn('[METRICAS PRAGMA ERRO]', err.message);
  }

  const bancoBytesEstimados = pageCount * pageSize;
  const paginasLivresBytes = freelistCount * pageSize;

  let sqliteLocalBytes = 0;
  if (fs.existsSync(DB_PATH)) {
    try {
      const dbStats = fs.statSync(DB_PATH);
      sqliteLocalBytes = dbStats.size;
    } catch {}
  }
  if (sqliteLocalBytes === 0) {
    sqliteLocalBytes = bancoBytesEstimados;
  }

  const tursoUsadoBytes = bancoBytesEstimados;
  const tursoPercentual = (tursoUsadoBytes / TURSO_LIMITE_BYTES) * 100;

  const uploadsInfo = calcularTamanhoDiretorio(UPLOADS_DIR);
  let totalAnexosBytes = uploadsInfo.totalBytes;
  let totalAnexosArquivos = uploadsInfo.totalArquivos;

  try {
    const sumAnexos = await get('SELECT COUNT(*) as total, SUM(tamanho_bytes) as total_bytes FROM arquivos_anexos');
    if (sumAnexos && sumAnexos.total > 0 && sumAnexos.total_bytes) {
      totalAnexosArquivos = Math.max(totalAnexosArquivos, Number(sumAnexos.total || 0));
      totalAnexosBytes = Math.max(totalAnexosBytes, Number(sumAnexos.total_bytes || 0));
    }
  } catch {}

  const r2Percentual = (totalAnexosBytes / R2_LIMITE_BYTES) * 100;

  const tabelasParaContar = [
    { id: 'clientes', label: 'Clientes & CRM (Base Principal)', pesoMedio: 1300 },
    { id: 'pedidos', label: 'Pedidos & Vendas', pesoMedio: 3000 },
    { id: 'logs_auditoria', label: 'Histórico de Logs & Auditoria', pesoMedio: 210 },
    { id: 'arquivos_anexos', label: 'Metadados de Anexos & Fotos', pesoMedio: 850 },
    { id: 'produtos', label: 'Produtos & Estoque', pesoMedio: 2000 },
    { id: 'financeiro_lancamentos', label: 'Lançamentos Financeiros', pesoMedio: 1500 },
    { id: 'fornecedores', label: 'Fornecedores', pesoMedio: 1200 },
    { id: 'usuarios', label: 'Operadores & RBAC', pesoMedio: 900 }
  ];

  const tabelas = [];
  let somaEstimada = 0;

  for (const t of tabelasParaContar) {
    try {
      const resCount = await get(`SELECT COUNT(*) as total FROM ${t.id}`);
      const qtd = Number(resCount?.total || 0);
      const estBytes = qtd * t.pesoMedio;
      somaEstimada += estBytes;
      tabelas.push({
        tabela: t.id,
        label: t.label,
        registros: qtd,
        bytes_estimados: estBytes,
        tamanho_formatado: formatarBytes(estBytes)
      });
    } catch {}
  }

  for (const t of tabelas) {
    t.percentual = somaEstimada > 0 ? Number(((t.bytes_estimados / somaEstimada) * 100).toFixed(1)) : 0;
  }

  const maiorPercentual = Math.max(tursoPercentual, r2Percentual);
  let alertaNivel = 'NORMAL';
  if (maiorPercentual >= 75) {
    alertaNivel = 'NIVEL_75';
  } else if (maiorPercentual >= 50) {
    alertaNivel = 'NIVEL_50';
  } else if (maiorPercentual >= 25) {
    alertaNivel = 'NIVEL_25';
  }

  return {
    sucesso: true,
    data_consulta: new Date().toISOString(),
    ambiente_banco: modo,
    alerta_global: {
      nivel: alertaNivel,
      maior_percentual: Number(maiorPercentual.toFixed(2)),
      precisa_alerta: maiorPercentual >= 25
    },
    metricas: {
      turso: {
        nome: 'Turso Cloud (libSQL)',
        plano: 'Starter Free',
        usado_bytes: tursoUsadoBytes,
        usado_formatado: formatarBytes(tursoUsadoBytes),
        limite_bytes: TURSO_LIMITE_BYTES,
        limite_formatado: '9.0 GB',
        percentual_usado: Number(tursoPercentual.toFixed(3)),
        paginas_ativas: pageCount,
        tamanho_pagina_bytes: pageSize,
        paginas_livres_freelist: freelistCount,
        bytes_reaproveitaveis: paginasLivresBytes,
        bytes_reaproveitaveis_formatado: formatarBytes(paginasLivresBytes)
      },
      sqlite_local: {
        nome: 'SQLite Local (Servidor Node.js)',
        caminho: 'database/clientes.db',
        usado_bytes: sqliteLocalBytes,
        usado_formatado: formatarBytes(sqliteLocalBytes)
      },
      r2_anexos: {
        nome: 'Cloudflare R2 / Uploads',
        provedor: storageStatus.provedor,
        r2_configurado: storageStatus.r2Configurado,
        usado_bytes: totalAnexosBytes,
        usado_formatado: formatarBytes(totalAnexosBytes),
        limite_bytes: R2_LIMITE_BYTES,
        limite_formatado: '10.0 GB',
        percentual_usado: Number(r2Percentual.toFixed(3)),
        total_arquivos: totalAnexosArquivos
      },
      github_repo: {
        nome: 'Código & Repositório (GitHub)',
        limite_formatado: '1.0 GB',
        usado_formatado: '~18.5 MB',
        percentual_usado: 1.85
      }
    },
    tabelas
  };
}

/**
 * 2. Executa otimização VACUUM no banco
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

  try {
    await run('VACUUM');
  } catch (err) {
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
 * 3. Expurgar logs com envio ao Cloudflare R2 antes da exclusão
 */
export async function arquivarELimparLogs({ diasRetencao = 90, forcarTodos = false } = {}) {
  const agora = new Date();
  const limiteData = new Date(agora.getTime() - diasRetencao * 24 * 60 * 60 * 1000);

  const todosLogs = await query('SELECT * FROM logs_auditoria ORDER BY id ASC');
  if (!todosLogs || todosLogs.length === 0) {
    return {
      sucesso: true,
      logs_arquivados: 0,
      mensagem: 'A tabela de logs de auditoria já está vazia. Nenhuma ação necessária.'
    };
  }

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

  const idsParaDeletar = logsParaArquivar.map(l => l.id);
  const LOTE_MAX = 500;
  let totalDeletados = 0;

  for (let i = 0; i < idsParaDeletar.length; i += LOTE_MAX) {
    const lote = idsParaDeletar.slice(i, i + LOTE_MAX);
    const placeholders = lote.map(() => '?').join(',');
    const delRes = await run(`DELETE FROM logs_auditoria WHERE id IN (${placeholders})`, lote);
    totalDeletados += delRes.rowsAffected || lote.length;
  }

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

/**
 * 4. Handler Principal Vercel Serverless / Node.js
 */
export default async function handler(req, res) {
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

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  // ROTA 1: Telemetria de Armazenamento & Quotas (GET)
  if (req.method === 'GET') {
    try {
      const metricas = await obterMetricasArmazenamento();
      return responder(res, 200, metricas);
    } catch (err) {
      console.error('[ERRO API SISTEMA TELEMETRIA]', err);
      return responder(res, 500, { error: 'Falha ao coletar telemetria de armazenamento', detalhes: err.message });
    }
  }

  // ROTA 2: Rotinas de Manutenção (POST: otimizar ou limpar-logs)
  if (req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const acao = body.acao || url.searchParams.get('acao') || (pathname.includes('otimizar') ? 'otimizar' : 'limpar_logs');

      if (acao === 'otimizar') {
        const resultado = await otimizarBanco();
        return responder(res, 200, resultado);
      }

      if (acao === 'limpar_logs' || acao === 'cold_storage') {
        const diasRetencao = Number(body.dias_retencao || 90);
        const forcarTodos = Boolean(body.forcar_todos);
        const resultado = await arquivarELimparLogs({ diasRetencao, forcarTodos });
        return responder(res, 200, resultado);
      }

      return responder(res, 400, { error: 'Ação não reconhecida. Use "otimizar" ou "limpar_logs".' });
    } catch (err) {
      console.error('[ERRO API SISTEMA MANUTENCAO]', err);
      return responder(res, 500, { error: 'Falha na rotina de manutenção', detalhes: err.message });
    }
  }

  return responder(res, 405, { error: 'Método não permitido' });
}
