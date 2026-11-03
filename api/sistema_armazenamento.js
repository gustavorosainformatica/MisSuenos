/**
 * Vercel Serverless Function & Node.js Handler: /api/sistema/armazenamento
 * Telemetria de Armazenamento, Quotas e Métricas de Banco (Turso libSQL / SQLite Local / Cloudflare R2)
 * Autor: Gustavo Rosa Informática / Mis Sueños ERP
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, get, modoAtivo } from '../lib/db.js';
import { getStorageStatus } from '../lib/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.join(__dirname, '..');
const DB_PATH = path.join(BASE_DIR, 'database', 'clientes.db');
const UPLOADS_DIR = path.join(BASE_DIR, 'public', 'uploads');

// Constantes de limites do plano gratuito (Freeware / Starter)
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

export async function obterMetricasArmazenamento() {
  const modo = modoAtivo();
  const storageStatus = getStorageStatus();

  // 1. Métricas do Banco de Dados Ativo via PRAGMA
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

  // 2. Medição do arquivo físico local se disponível
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

  // Se estiver no Turso Cloud, usa bancoBytesEstimados como consumo do Turso
  const tursoUsadoBytes = modo.includes('Turso') ? bancoBytesEstimados : bancoBytesEstimados;
  const tursoPercentual = (tursoUsadoBytes / TURSO_LIMITE_BYTES) * 100;

  // 3. Medição dos Anexos / Uploads / R2
  const uploadsInfo = calcularTamanhoDiretorio(UPLOADS_DIR);
  let totalAnexosBytes = uploadsInfo.totalBytes;
  let totalAnexosArquivos = uploadsInfo.totalArquivos;

  // Tenta consultar na tabela arquivos_anexos se houver registros
  try {
    const sumAnexos = await get('SELECT COUNT(*) as total, SUM(tamanho_bytes) as total_bytes FROM arquivos_anexos');
    if (sumAnexos && sumAnexos.total > 0 && sumAnexos.total_bytes) {
      totalAnexosArquivos = Math.max(totalAnexosArquivos, Number(sumAnexos.total || 0));
      totalAnexosBytes = Math.max(totalAnexosBytes, Number(sumAnexos.total_bytes || 0));
    }
  } catch {}

  const r2Percentual = (totalAnexosBytes / R2_LIMITE_BYTES) * 100;

  // 4. Detalhamento por Tabela
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

  // Calcula percentuais relativos das tabelas
  for (const t of tabelas) {
    t.percentual = somaEstimada > 0 ? Number(((t.bytes_estimados / somaEstimada) * 100).toFixed(1)) : 0;
  }

  // 5. Determinação do Nível de Alerta (25%, 50%, 75%)
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

export default async function handlerSistemaArmazenamento(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'Método não permitido. Use GET.' }));
  }

  try {
    const dados = await obterMetricasArmazenamento();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify(dados));
  } catch (err) {
    console.error('[ERRO API ARMAZENAMENTO]', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'Falha ao coletar telemetria de armazenamento', detalhes: err.message }));
  }
}
