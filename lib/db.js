/**
 * Módulo de Conexão com Banco de Dados Híbrido (Turso Cloud / SQLite Local)
 * Autor: Gustavo Rosa Informática
 * 
 * Funcionalidade:
 * - Se TURSO_DATABASE_URL estiver definido: conecta com @libsql/client no Turso Cloud (SQLite Serverless global).
 * - Se não estiver definido: conecta com SQLite local (database/clientes.db) via node:sqlite.
 * - Suporta tanto Serverless Functions da Vercel quanto Servidor Local Node.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.join(__dirname, '..');
const DB_PATH = path.join(BASE_DIR, 'database', 'clientes.db');

// Tenta carregar .env se existir (modo local)
try {
  const envPath = path.join(BASE_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const dotenv = await import('dotenv');
    dotenv.config({ path: envPath });
  }
} catch {
  // Ignora se dotenv não estiver disponível
}

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

let libsqlClient = null;
let localSqliteDb = null;
let isTurso = false;

// Inicializa conexão adequada
if (TURSO_URL) {
  try {
    const { createClient } = await import('@libsql/client');
    libsqlClient = createClient({
      url: TURSO_URL,
      authToken: TURSO_TOKEN
    });
    isTurso = true;
    console.log('[BANCO] Conectado ao Turso Cloud:', TURSO_URL);
  } catch (err) {
    console.warn('[BANCO AVISO] Falha ao inicializar @libsql/client, tentando fallback local:', err.message);
  }
}

if (!libsqlClient) {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    if (fs.existsSync(DB_PATH)) {
      localSqliteDb = new DatabaseSync(DB_PATH);
      console.log('[BANCO] Conectado ao SQLite local:', DB_PATH);
    } else {
      console.warn('[BANCO AVISO] Arquivo SQLite local não encontrado em:', DB_PATH);
    }
  } catch (err) {
    console.error('[BANCO ERRO] Falha ao conectar ao SQLite local:', err.message);
  }
}

/**
 * Garante que a tabela de logs e índices existam no banco ativo
 */
export async function inicializarTabelas() {
  const sql = `
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      apelido_referencia TEXT,
      razao_social TEXT,
      cpf TEXT,
      cpf_limpo TEXT,
      cnpj TEXT,
      cnpj_limpo TEXT,
      ie TEXT,
      telefone TEXT,
      telefone_limpo TEXT,
      endereco_completo TEXT,
      logradouro TEXT,
      numero TEXT,
      complemento TEXT,
      bairro TEXT,
      cidade TEXT,
      uf TEXT,
      cep TEXT,
      cep_limpo TEXT,
      observacoes TEXT,
      arquivo_origem TEXT,
      data_cadastro TEXT
    );

    CREATE TABLE IF NOT EXISTS logs_auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      cliente_nome TEXT,
      tipo_acao TEXT NOT NULL,
      campos_alterados TEXT,
      detalhes TEXT,
      ip_origem TEXT,
      user_agent TEXT,
      data_hora TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS arquivos_anexos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      cliente_nome TEXT,
      tipo_documento TEXT NOT NULL,
      titulo TEXT,
      nome_arquivo TEXT NOT NULL,
      tamanho_bytes INTEGER,
      mimetype TEXT,
      storage_provedor TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      url TEXT NOT NULL,
      observacoes TEXT,
      data_upload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo_sku TEXT UNIQUE,
      nome TEXT NOT NULL,
      categoria TEXT NOT NULL,
      unidade_medida TEXT DEFAULT 'UN',
      preco_custo REAL DEFAULT 0,
      preco_venda REAL NOT NULL DEFAULT 0,
      estoque_atual REAL NOT NULL DEFAULT 0,
      estoque_minimo REAL DEFAULT 5,
      descricao TEXT,
      ativo INTEGER DEFAULT 1,
      is_teste INTEGER DEFAULT 0,
      data_cadastro TEXT NOT NULL,
      data_atualizacao TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes (nome);
    CREATE INDEX IF NOT EXISTS idx_clientes_uf ON clientes (uf);
    CREATE INDEX IF NOT EXISTS idx_clientes_cidade ON clientes (cidade);
    CREATE INDEX IF NOT EXISTS idx_logs_cliente ON logs_auditoria (cliente_id);
    CREATE INDEX IF NOT EXISTS idx_logs_data ON logs_auditoria (data_hora);
    CREATE INDEX IF NOT EXISTS idx_anexos_cliente ON arquivos_anexos (cliente_id);
    CREATE INDEX IF NOT EXISTS idx_anexos_tipo ON arquivos_anexos (tipo_documento);
    CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos (categoria);
    CREATE INDEX IF NOT EXISTS idx_produtos_sku ON produtos (codigo_sku);
    CREATE INDEX IF NOT EXISTS idx_produtos_nome ON produtos (nome);
  `;

  if (isTurso && libsqlClient) {
    await libsqlClient.executeMultiple(sql);
  } else if (localSqliteDb) {
    localSqliteDb.exec(sql);
  }
}

/**
 * Executa comandos DDL múltiplos ou únicos
 */
export async function execute(sql) {
  if (isTurso && libsqlClient) {
    return await libsqlClient.executeMultiple(sql);
  }
  if (localSqliteDb) {
    return localSqliteDb.exec(sql);
  }
  throw new Error('Nenhum banco de dados disponível');
}

// Tenta inicializar tabelas na inicialização de forma segura
inicializarTabelas().catch(err => {
  console.warn('[BANCO INIT] Aviso ao checar tabelas:', err.message);
});

/**
 * Executa uma consulta SQL e retorna todas as linhas como array de objetos
 */
export async function query(sql, params = []) {
  if (isTurso && libsqlClient) {
    const rs = await libsqlClient.execute({ sql, args: params });
    return rs.rows;
  }

  if (localSqliteDb) {
    const stmt = localSqliteDb.prepare(sql);
    return stmt.all(...params);
  }

  throw new Error('Nenhum banco de dados disponível (Turso ou SQLite local)');
}

/**
 * Executa uma consulta SQL e retorna a primeira linha ou null
 */
export async function get(sql, params = []) {
  if (isTurso && libsqlClient) {
    const rs = await libsqlClient.execute({ sql, args: params });
    return rs.rows.length > 0 ? rs.rows[0] : null;
  }

  if (localSqliteDb) {
    const stmt = localSqliteDb.prepare(sql);
    return stmt.get(...params) || null;
  }

  throw new Error('Nenhum banco de dados disponível (Turso ou SQLite local)');
}

/**
 * Executa um comando SQL (INSERT, UPDATE, DELETE)
 */
export async function run(sql, params = []) {
  if (isTurso && libsqlClient) {
    const rs = await libsqlClient.execute({ sql, args: params });
    return {
      lastInsertRowid: rs.lastInsertRowid ? Number(rs.lastInsertRowid) : null,
      rowsAffected: rs.rowsAffected || 0
    };
  }

  if (localSqliteDb) {
    const stmt = localSqliteDb.prepare(sql);
    const info = stmt.run(...params);
    return {
      lastInsertRowid: info.lastInsertRowid ? Number(info.lastInsertRowid) : null,
      rowsAffected: info.changes || 0
    };
  }

  throw new Error('Nenhum banco de dados disponível (Turso ou SQLite local)');
}

/**
 * Registra um log de auditoria diretamente no banco de dados ativo
 */
export async function registrarLog({ clienteId, clienteNome, tipoAcao, camposAlterados, detalhes, req, ip, userAgent }) {
  try {
    const ipFinal = ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '127.0.0.1';
    const uaFinal = userAgent || (req?.headers?.['user-agent'] || 'Web Client').slice(0, 200);
    const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const sql = `
      INSERT INTO logs_auditoria (
        cliente_id, cliente_nome, tipo_acao, campos_alterados, detalhes, ip_origem, user_agent, data_hora
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const camposStr = Array.isArray(camposAlterados) ? camposAlterados.join(', ') : (camposAlterados || '');

    await run(sql, [
      clienteId || null,
      clienteNome || 'Cliente',
      tipoAcao,
      camposStr,
      detalhes || '',
      ipFinal,
      uaFinal,
      dataHora
    ]);

    console.log(`[LOG REGISTRADO] ${tipoAcao} | #${clienteId || 'N/A'} (${clienteNome}) em ${dataHora}`);
  } catch (err) {
    console.error('[ERRO GRAVAR LOG]', err.message);
  }
}

export function modoAtivo() {
  return isTurso ? 'Turso Cloud' : 'SQLite Local';
}
