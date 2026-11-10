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
if (!process.env.FORCAR_SQLITE_LOCAL && TURSO_URL) {
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

    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT NOT NULL UNIQUE,
      cliente_id INTEGER,
      cliente_nome TEXT NOT NULL,
      cidade TEXT,
      uf TEXT,
      telefone TEXT,
      itens TEXT NOT NULL,
      valor_total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO',
      status_texto TEXT NOT NULL DEFAULT 'Aguardando Pagamento',
      codigo_rastreio TEXT,
      observacoes TEXT,
      data_pedido TEXT NOT NULL,
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
    CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_id ON pedidos (cliente_id);
    CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos (status);
    CREATE INDEX IF NOT EXISTS idx_pedidos_numero ON pedidos (numero);
    CREATE INDEX IF NOT EXISTS idx_pedidos_rastreio ON pedidos (codigo_rastreio);

    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      login TEXT UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL,
      papel TEXT NOT NULL DEFAULT 'OPERADOR',
      permissoes TEXT DEFAULT '{}',
      cliente_id INTEGER,
      ativo INTEGER DEFAULT 1,
      ultimo_login TEXT,
      data_cadastro TEXT NOT NULL,
      data_atualizacao TEXT,
      tamanho_pin INTEGER DEFAULT 6
    );

    CREATE INDEX IF NOT EXISTS idx_usuarios_login ON usuarios (login);
    CREATE INDEX IF NOT EXISTS idx_usuarios_papel ON usuarios (papel);

    CREATE TABLE IF NOT EXISTS fornecedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      razao_social TEXT NOT NULL,
      nome_fantasia TEXT,
      cnpj TEXT UNIQUE,
      ie TEXT,
      telefone TEXT,
      email TEXT,
      endereco TEXT,
      cidade TEXT,
      uf TEXT,
      cep TEXT,
      observacoes TEXT,
      ativo INTEGER DEFAULT 1,
      data_cadastro TEXT NOT NULL,
      data_atualizacao TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_fornecedores_cnpj ON fornecedores (cnpj);
    CREATE INDEX IF NOT EXISTS idx_fornecedores_nome ON fornecedores (razao_social);

    CREATE TABLE IF NOT EXISTS financeiro_lancamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      origem TEXT DEFAULT 'MANUAL',
      descricao TEXT NOT NULL,
      categoria TEXT DEFAULT 'Geral',
      cliente_id INTEGER,
      cliente_nome TEXT,
      fornecedor_id INTEGER,
      fornecedor_nome TEXT,
      pedido_id INTEGER,
      chave_nfe_origem TEXT,
      valor REAL NOT NULL DEFAULT 0,
      data_vencimento TEXT NOT NULL,
      data_pagamento TEXT,
      forma_pagamento TEXT DEFAULT 'PIX',
      status TEXT NOT NULL DEFAULT 'PENDENTE',
      comprovante_url TEXT,
      observacoes TEXT,
      recorrente INTEGER DEFAULT 0,
      data_cadastro TEXT NOT NULL,
      data_atualizacao TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_fin_tipo ON financeiro_lancamentos (tipo);
    CREATE INDEX IF NOT EXISTS idx_fin_status ON financeiro_lancamentos (status);
    CREATE INDEX IF NOT EXISTS idx_fin_vencimento ON financeiro_lancamentos (data_vencimento);
    CREATE INDEX IF NOT EXISTS idx_fin_pedido ON financeiro_lancamentos (pedido_id);

    CREATE TABLE IF NOT EXISTS compras_xml (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chave_nfe TEXT UNIQUE NOT NULL,
      numero_nfe TEXT,
      serie_nfe TEXT,
      fornecedor_id INTEGER,
      fornecedor_cnpj TEXT,
      fornecedor_nome TEXT,
      valor_total REAL DEFAULT 0,
      data_emissao TEXT,
      itens_json TEXT,
      xml_bruto TEXT,
      data_importacao TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_compras_chave ON compras_xml (chave_nfe);

    CREATE TABLE IF NOT EXISTS estoque_movimentacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('ENTRADA', 'SAIDA')),
      origem TEXT NOT NULL CHECK(origem IN ('COMPRA', 'VENDA', 'AJUSTE_MANUAL', 'INVENTARIO', 'PRODUCAO', 'LOCACAO')),
      motivo TEXT NOT NULL,
      quantidade REAL NOT NULL CHECK(quantidade > 0),
      saldo_anterior REAL NOT NULL,
      saldo_posterior REAL NOT NULL,
      custo_unitario REAL DEFAULT 0,
      documento_referencia TEXT,
      observacoes TEXT,
      operador_id INTEGER,
      operador_nome TEXT,
      data_movimentacao DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (produto_id) REFERENCES produtos(id)
    );

    CREATE INDEX IF NOT EXISTS idx_estoque_mov_prod ON estoque_movimentacoes(produto_id, data_movimentacao DESC);

    CREATE TABLE IF NOT EXISTS configuracoes_sistema (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      data_atualizacao TEXT NOT NULL
    );

    -- =========================================================================
    -- SUÍTE EMPRESARIAL DE SUPRIMENTOS, LOGÍSTICA, CONCILIAÇÃO E FISCAL
    -- =========================================================================

    -- 1. Tabela de Vínculo De-Para Inteligente de Produtos do Fornecedor
    CREATE TABLE IF NOT EXISTS fornecedores_produtos_vinculo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fornecedor_id INTEGER NOT NULL,
      codigo_fornecedor TEXT NOT NULL,
      ean_fornecedor TEXT,
      descricao_fornecedor TEXT NOT NULL,
      produto_erp_id INTEGER NOT NULL,
      fator_conversao REAL DEFAULT 1.0,
      unidade_fornecedor TEXT,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(fornecedor_id, codigo_fornecedor)
    );

    CREATE INDEX IF NOT EXISTS idx_vinculo_fornecedor ON fornecedores_produtos_vinculo (fornecedor_id);
    CREATE INDEX IF NOT EXISTS idx_vinculo_codigo ON fornecedores_produtos_vinculo (codigo_fornecedor);
    CREATE INDEX IF NOT EXISTS idx_vinculo_produto ON fornecedores_produtos_vinculo (produto_erp_id);

    -- 2. Tabela de Provedores de Frete e Configurações de Logística
    CREATE TABLE IF NOT EXISTS transportadoras_config (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      ativo INTEGER DEFAULT 0,
      padrao INTEGER DEFAULT 0,
      token_acesso TEXT,
      ambiente TEXT DEFAULT 'producao',
      formato_etiqueta_padrao TEXT DEFAULT 'termica_100x150',
      dados_origem_json TEXT,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. Tabela de Extratos Bancários e Conciliação
    CREATE TABLE IF NOT EXISTS conciliacao_extratos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conta_bancaria_id INTEGER,
      origem TEXT NOT NULL,
      fitid TEXT UNIQUE,
      data_transacao TEXT NOT NULL,
      descricao TEXT NOT NULL,
      tipo TEXT NOT NULL,
      valor REAL NOT NULL,
      status TEXT DEFAULT 'PENDENTE',
      transacao_financeiro_id INTEGER,
      score_match REAL DEFAULT 0.0,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_conciliacao_status ON conciliacao_extratos (status);
    CREATE INDEX IF NOT EXISTS idx_conciliacao_data ON conciliacao_extratos (data_transacao);
    CREATE INDEX IF NOT EXISTS idx_conciliacao_fitid ON conciliacao_extratos (fitid);

    -- 4. Tabela de Configuração Fiscal e Certificado Digital A1
    CREATE TABLE IF NOT EXISTS fiscal_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ambiente TEXT DEFAULT 'homologacao',
      driver_ativo TEXT DEFAULT 'wlg',
      provedor_token TEXT,
      certificado_a1_base64 TEXT,
      certificado_senha TEXT,
      certificado_valido_ate TEXT,
      certificado_cnpj TEXT,
      certificado_razao_social TEXT,
      serie_nfe INTEGER DEFAULT 1,
      ultimo_numero_nfe INTEGER DEFAULT 0,
      serie_nfse INTEGER DEFAULT 1,
      ultimo_numero_nfse INTEGER DEFAULT 0,
      atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 5. Tabela de Histórico e Armazenamento de Documentos Fiscais Emitidos
    CREATE TABLE IF NOT EXISTS fiscal_documentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER,
      tipo TEXT NOT NULL,
      numero INTEGER NOT NULL,
      serie INTEGER NOT NULL,
      chave_acesso TEXT UNIQUE,
      protocolo_autorizacao TEXT,
      status TEXT NOT NULL,
      motivo_status TEXT,
      xml_assinado TEXT,
      danfe_pdf_url TEXT,
      emitido_em TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(pedido_id) REFERENCES pedidos(id)
    );

    CREATE INDEX IF NOT EXISTS idx_fiscal_chave ON fiscal_documentos (chave_acesso);
    CREATE INDEX IF NOT EXISTS idx_fiscal_pedido ON fiscal_documentos (pedido_id);
    CREATE INDEX IF NOT EXISTS idx_fiscal_status ON fiscal_documentos (status);
  `;


  const seedSuiteSuprimentosSql = `
    INSERT OR IGNORE INTO transportadoras_config (id, nome, ativo, padrao, ambiente, formato_etiqueta_padrao)
    VALUES 
      ('melhor_envio', 'Melhor Envio - Hub Logístico', 1, 1, 'sandbox', 'termica_100x150'),
      ('superfrete', 'SuperFrete - Correios & Jadlog', 0, 0, 'producao', 'termica_100x150'),
      ('correios_cws', 'Correios CWS Oficial', 0, 0, 'producao', 'termica_100x150'),
      ('frenet', 'Frenet Gateway', 0, 0, 'producao', 'termica_100x150');

    INSERT OR IGNORE INTO fiscal_config (id, ambiente, driver_ativo, serie_nfe, ultimo_numero_nfe, serie_nfse, ultimo_numero_nfse)
    VALUES (1, 'homologacao', 'wlg', 1, 0, 1, 0);
  `;

  if (isTurso && libsqlClient) {
    await libsqlClient.executeMultiple(sql);
    try { await libsqlClient.execute("ALTER TABLE produtos ADD COLUMN ncm TEXT DEFAULT ''"); } catch {}
    try { await libsqlClient.execute("ALTER TABLE produtos ADD COLUMN codigo_barras TEXT DEFAULT ''"); } catch {}
    try { await libsqlClient.execute("ALTER TABLE produtos ADD COLUMN estoque_reservado REAL NOT NULL DEFAULT 0"); } catch {}
    try { await libsqlClient.execute("ALTER TABLE usuarios ADD COLUMN data_atualizacao_senha TEXT"); } catch {}
    try { await libsqlClient.execute("ALTER TABLE usuarios ADD COLUMN exigir_troca_senha INTEGER DEFAULT 0"); } catch {}
    try { await libsqlClient.execute("ALTER TABLE usuarios ADD COLUMN tamanho_pin INTEGER DEFAULT 6"); } catch {}
    try { await libsqlClient.execute("ALTER TABLE pedidos ADD COLUMN transportadora TEXT DEFAULT 'Correios'"); } catch {}
    try { await libsqlClient.execute("ALTER TABLE pedidos ADD COLUMN url_rastreio TEXT"); } catch {}
    try { await libsqlClient.execute("ALTER TABLE pedidos ADD COLUMN data_envio TEXT"); } catch {}
    try { await libsqlClient.execute("ALTER TABLE pedidos ADD COLUMN data_entrega TEXT"); } catch {}
    try { await libsqlClient.execute("ALTER TABLE pedidos ADD COLUMN ultimo_status_rastreio TEXT"); } catch {}
    try { await libsqlClient.execute("ALTER TABLE pedidos ADD COLUMN valor_frete REAL DEFAULT 0"); } catch {}
    try { await libsqlClient.execute("ALTER TABLE clientes ADD COLUMN preferencias TEXT DEFAULT ''"); } catch {}
    try { await libsqlClient.execute("ALTER TABLE clientes ADD COLUMN email TEXT DEFAULT ''"); } catch {}
    try { await libsqlClient.execute("ALTER TABLE financeiro_lancamentos ADD COLUMN recorrente INTEGER DEFAULT 0"); } catch {}
    try { await libsqlClient.executeMultiple(seedSuiteSuprimentosSql); } catch (e) { console.warn('[SEED SUPRIMENTOS TURSO]', e.message); }
  } else if (localSqliteDb) {
    localSqliteDb.exec(sql);
    try { localSqliteDb.exec("ALTER TABLE produtos ADD COLUMN ncm TEXT DEFAULT ''"); } catch {}
    try { localSqliteDb.exec("ALTER TABLE produtos ADD COLUMN codigo_barras TEXT DEFAULT ''"); } catch {}
    try { localSqliteDb.exec("ALTER TABLE produtos ADD COLUMN estoque_reservado REAL NOT NULL DEFAULT 0"); } catch {}
    try { localSqliteDb.exec("ALTER TABLE usuarios ADD COLUMN data_atualizacao_senha TEXT"); } catch {}
    try { localSqliteDb.exec("ALTER TABLE usuarios ADD COLUMN exigir_troca_senha INTEGER DEFAULT 0"); } catch {}
    try { localSqliteDb.exec("ALTER TABLE usuarios ADD COLUMN tamanho_pin INTEGER DEFAULT 6"); } catch {}
    try { localSqliteDb.exec("ALTER TABLE pedidos ADD COLUMN transportadora TEXT DEFAULT 'Correios'"); } catch {}
    try { localSqliteDb.exec("ALTER TABLE pedidos ADD COLUMN url_rastreio TEXT"); } catch {}
    try { localSqliteDb.exec("ALTER TABLE pedidos ADD COLUMN data_envio TEXT"); } catch {}
    try { localSqliteDb.exec("ALTER TABLE pedidos ADD COLUMN data_entrega TEXT"); } catch {}
    try { localSqliteDb.exec("ALTER TABLE pedidos ADD COLUMN ultimo_status_rastreio TEXT"); } catch {}
    try { localSqliteDb.exec("ALTER TABLE pedidos ADD COLUMN valor_frete REAL DEFAULT 0"); } catch {}
    try { localSqliteDb.exec("ALTER TABLE clientes ADD COLUMN preferencias TEXT DEFAULT ''"); } catch {}
    try { localSqliteDb.exec("ALTER TABLE clientes ADD COLUMN email TEXT DEFAULT ''"); } catch {}
    try { localSqliteDb.exec("ALTER TABLE financeiro_lancamentos ADD COLUMN recorrente INTEGER DEFAULT 0"); } catch {}
    try { localSqliteDb.exec(seedSuiteSuprimentosSql); } catch (e) { console.warn('[SEED SUPRIMENTOS LOCAL]', e.message); }
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
