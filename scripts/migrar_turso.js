#!/usr/bin/env node
/**
 * Script de Migração Automática: SQLite Local -> Turso Cloud
 * Autor: Gustavo Rosa Informática
 * 
 * Uso:
 * 1. Crie seu banco no Turso: turso db create missuenos-db
 * 2. Obtenha a URL: turso db show missuenos-db --url
 * 3. Obtenha o Token: turso db tokens create missuenos-db
 * 4. Configure no arquivo .env ou passe como variáveis de ambiente:
 *    TURSO_DATABASE_URL=libsql://missuenos-db-seuusuario.turso.io
 *    TURSO_AUTH_TOKEN=seu_token_aqui
 * 5. Execute: node scripts/migrar_turso.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.join(__dirname, '..');
const DB_LOCAL_PATH = path.join(BASE_DIR, 'database', 'clientes.db');

// Carrega .env
dotenv.config({ path: path.join(BASE_DIR, '.env') });

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

console.log('='.repeat(70));
console.log('🚀 MIGRADOR TURSO CLOUD - GUSTAVO ROSA INFORMÁTICA');
console.log('='.repeat(70));

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('\n❌ ERRO: Variáveis de ambiente TURSO_DATABASE_URL ou TURSO_AUTH_TOKEN não configuradas!');
  console.log('\nComo configurar:');
  console.log('1. Crie um arquivo .env na raiz do projeto com o seguinte conteúdo:');
  console.log('   TURSO_DATABASE_URL="libsql://missuenos-db-seuusuario.turso.io"');
  console.log('   TURSO_AUTH_TOKEN="seu_token_aqui"');
  console.log('\n2. Em seguida, execute este script novamente:');
  console.log('   node scripts/migrar_turso.js\n');
  process.exit(1);
}

if (!fs.existsSync(DB_LOCAL_PATH)) {
  console.error(`\n❌ ERRO: Banco SQLite local não encontrado em ${DB_LOCAL_PATH}`);
  process.exit(1);
}

async function migrar() {
  console.log(`\n📂 1. Lendo base de dados local: ${DB_LOCAL_PATH}...`);
  const localDb = new DatabaseSync(DB_LOCAL_PATH);
  const clientes = localDb.prepare('SELECT * FROM clientes ORDER BY id ASC').all();
  let logs = [];
  try {
    logs = localDb.prepare('SELECT * FROM logs_auditoria ORDER BY id ASC').all();
  } catch {
    logs = [];
  }
  console.log(`   ✔ ${clientes.length} clientes encontrados no SQLite local.`);
  console.log(`   ✔ ${logs.length} logs de auditoria encontrados no SQLite local.`);

  console.log(`\n☁️  2. Conectando ao Turso Cloud: ${TURSO_URL}...`);
  const turso = createClient({
    url: TURSO_URL,
    authToken: TURSO_TOKEN
  });

  console.log('   ✔ Conexão estabelecida com sucesso!');

  console.log('\n🏗️  3. Criando tabelas no Turso Cloud...');
  await turso.executeMultiple(`
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

    CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes (nome);
    CREATE INDEX IF NOT EXISTS idx_clientes_uf ON clientes (uf);
    CREATE INDEX IF NOT EXISTS idx_clientes_cidade ON clientes (cidade);
    CREATE INDEX IF NOT EXISTS idx_logs_cliente ON logs_auditoria (cliente_id);
    CREATE INDEX IF NOT EXISTS idx_logs_data ON logs_auditoria (data_hora);
  `);
  console.log('   ✔ Tabelas e índices criados no Turso Cloud.');

  console.log('\n📦 4. Enviando clientes em lotes de 100 para o Turso Cloud...');
  const BATCH_SIZE = 100;
  let inseridos = 0;

  for (let i = 0; i < clientes.length; i += BATCH_SIZE) {
    const lote = clientes.slice(i, i + BATCH_SIZE);
    const statements = lote.map(c => ({
      sql: `INSERT OR REPLACE INTO clientes (
        id, nome, apelido_referencia, razao_social, cpf, cpf_limpo,
        cnpj, cnpj_limpo, ie, telefone, telefone_limpo, endereco_completo,
        logradouro, numero, complemento, bairro, cidade, uf,
        cep, cep_limpo, observacoes, arquivo_origem, data_cadastro
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        c.id, c.nome, c.apelido_referencia, c.razao_social, c.cpf, c.cpf_limpo,
        c.cnpj, c.cnpj_limpo, c.ie, c.telefone, c.telefone_limpo, c.endereco_completo,
        c.logradouro, c.numero, c.complemento, c.bairro, c.cidade, c.uf,
        c.cep, c.cep_limpo, c.observacoes, c.arquivo_origem, c.data_cadastro
      ]
    }));

    await turso.batch(statements, 'write');
    inseridos += lote.length;
    process.stdout.write(`   Enviados: ${inseridos}/${clientes.length} (${Math.round(inseridos/clientes.length*100)}%)\r`);
  }
  console.log(`\n   ✔ Todos os ${inseridos} clientes sincronizados com o Turso Cloud!`);

  if (logs.length > 0) {
    console.log(`\n📜 5. Sincronizando ${logs.length} logs de auditoria...`);
    for (let i = 0; i < logs.length; i += BATCH_SIZE) {
      const lote = logs.slice(i, i + BATCH_SIZE);
      const statements = lote.map(l => ({
        sql: `INSERT OR REPLACE INTO logs_auditoria (
          id, cliente_id, cliente_nome, tipo_acao, campos_alterados, detalhes, ip_origem, user_agent, data_hora
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          l.id, l.cliente_id, l.cliente_nome, l.tipo_acao, l.campos_alterados, l.detalhes, l.ip_origem, l.user_agent, l.data_hora
        ]
      }));
      await turso.batch(statements, 'write');
    }
    console.log(`   ✔ Logs de auditoria sincronizados com sucesso!`);
  }

  // Registra log da migração no Turso
  await turso.execute({
    sql: `INSERT INTO logs_auditoria (
      cliente_id, cliente_nome, tipo_acao, campos_alterados, detalhes, ip_origem, user_agent, data_hora
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      null,
      'Sistema',
      'MIGRACAO_TURSO_CLOUD',
      'clientes, logs_auditoria',
      `Migração concluída com sucesso: ${clientes.length} clientes e ${logs.length} logs sincronizados.`,
      '127.0.0.1',
      'CLI Antigravity / Node.js',
      new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    ]
  });

  // Validação final
  const resultado = await turso.execute('SELECT COUNT(*) as total FROM clientes');
  const totalTurso = resultado.rows[0].total;

  console.log('\n' + '='.repeat(70));
  console.log(`🎉 MIGRAÇÃO CONCLUÍDA COM SUCESSO!`);
  console.log(`   Base Local:  ${clientes.length} clientes`);
  console.log(`   Turso Cloud: ${totalTurso} clientes`);
  console.log('='.repeat(70));
}

migrar().catch(err => {
  console.error('\n❌ Erro durante a migração:', err);
  process.exit(1);
});
