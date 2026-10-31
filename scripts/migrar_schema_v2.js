/**
 * Script de Migração de Schema v2 - Mis Sueños ERP & Template Base
 * Autor: Gustavo Rosa Informática
 * 
 * Garante de forma idempotente (no SQLite Local ou Turso Cloud):
 * 1. Adição das colunas 'ncm' e 'estoque_reservado' na tabela 'produtos'
 * 2. Criação das tabelas 'fornecedores', 'financeiro_lancamentos', 'compras_xml', 'configuracoes_sistema'
 */

import { execute, query, run } from '../lib/db.js';

async function main() {
  console.log('[MIGRAÇÃO V2] Iniciando evolução do schema de banco de dados...');

  // 1. Adicionar colunas em produtos (idempotente)
  try {
    await run("ALTER TABLE produtos ADD COLUMN ncm TEXT DEFAULT ''");
    console.log('[MIGRAÇÃO V2] Coluna produtos.ncm adicionada.');
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log('[MIGRAÇÃO V2] Coluna produtos.ncm já existe.');
    } else {
      console.log('[MIGRAÇÃO V2] Aviso ncm:', e.message);
    }
  }

  try {
    await run("ALTER TABLE produtos ADD COLUMN estoque_reservado REAL NOT NULL DEFAULT 0");
    console.log('[MIGRAÇÃO V2] Coluna produtos.estoque_reservado adicionada.');
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log('[MIGRAÇÃO V2] Coluna produtos.estoque_reservado já existe.');
    } else {
      console.log('[MIGRAÇÃO V2] Aviso estoque_reservado:', e.message);
    }
  }

  // 2. Criar novas tabelas e índices
  await execute(`
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

    CREATE TABLE IF NOT EXISTS configuracoes_sistema (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      data_atualizacao TEXT NOT NULL
    );
  `);

  // 3. Validar tabelas existentes no banco ativo
  const tabelas = await query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name ASC");
  console.log('[MIGRAÇÃO V2] Tabelas ativas no banco:', tabelas.map(t => t.name).join(', '));

  const colsProd = await query("PRAGMA table_info(produtos)");
  console.log('[MIGRAÇÃO V2] Colunas de produtos:', colsProd.map(c => c.name).join(', '));

  console.log('[MIGRAÇÃO V2] Evolução de schema concluída com 100% de sucesso!');
  process.exit(0);
}

main().catch((err) => {
  console.error('[MIGRAÇÃO V2 ERRO]', err);
  process.exit(1);
});

