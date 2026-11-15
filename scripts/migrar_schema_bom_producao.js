/**
 * Script de Migração: Ficha Técnica (BOM) & Ordens de Produção
 * Adiciona tabelas produtos_bom e producao_ordens, colunas custo_adicional_producao e tipo_item em produtos,
 * e inicializa a configuração producao_permitir_saldo_negativo.
 * Autor: Gustavo Rosa Informática
 * Ambiente: SQLite Local / Turso Cloud
 */

import { execute, query } from '../lib/db.js';

async function colunaExiste(tabela, coluna) {
  try {
    const colunas = await query(`PRAGMA table_info(${tabela})`);
    return colunas.some(c => c.name.toLowerCase() === coluna.toLowerCase());
  } catch (err) {
    console.error(`Erro ao verificar coluna ${coluna} em ${tabela}:`, err.message);
    return false;
  }
}

async function tabelaExiste(tabela) {
  try {
    const resultado = await query(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [tabela]);
    return resultado.length > 0;
  } catch (err) {
    console.error(`Erro ao verificar existência da tabela ${tabela}:`, err.message);
    return false;
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('🛠️ [MIGRAÇÃO BOM & PRODUÇÃO] Iniciando migração de schema...');
  console.log('='.repeat(70));

  try {
    // 1. Tabela produtos_bom
    const temTabelaBom = await tabelaExiste('produtos_bom');
    if (!temTabelaBom) {
      console.log('⚙️ [1/5] Criando tabela produtos_bom...');
      await execute(`
        CREATE TABLE IF NOT EXISTS produtos_bom (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          produto_pai_id INTEGER NOT NULL,
          produto_filho_id INTEGER NOT NULL,
          quantidade REAL NOT NULL CHECK(quantidade > 0),
          observacoes TEXT,
          data_cadastro TEXT NOT NULL,
          FOREIGN KEY (produto_pai_id) REFERENCES produtos(id) ON DELETE CASCADE,
          FOREIGN KEY (produto_filho_id) REFERENCES produtos(id),
          UNIQUE(produto_pai_id, produto_filho_id)
        );
        CREATE INDEX IF NOT EXISTS idx_produtos_bom_pai ON produtos_bom(produto_pai_id);
        CREATE INDEX IF NOT EXISTS idx_produtos_bom_filho ON produtos_bom(produto_filho_id);
      `);
      console.log('   ✔ Tabela produtos_bom criada com sucesso.');
    } else {
      console.log('   ℹ️ Tabela produtos_bom já existe.');
    }

    // 2. Tabela producao_ordens
    const temTabelaOrdens = await tabelaExiste('producao_ordens');
    if (!temTabelaOrdens) {
      console.log('⚙️ [2/5] Criando tabela producao_ordens...');
      await execute(`
        CREATE TABLE IF NOT EXISTS producao_ordens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          numero TEXT NOT NULL UNIQUE,
          produto_id INTEGER NOT NULL,
          quantidade REAL NOT NULL CHECK(quantidade > 0),
          custo_insumos REAL DEFAULT 0,
          custo_adicional REAL DEFAULT 0,
          custo_total REAL DEFAULT 0,
          custo_unitario_final REAL DEFAULT 0,
          status TEXT NOT NULL CHECK(status IN ('CONCLUIDA', 'ESTORNADA')) DEFAULT 'CONCLUIDA',
          data_producao TEXT NOT NULL,
          data_estorno TEXT,
          motivo_estorno TEXT,
          operador_nome TEXT,
          observacoes TEXT,
          itens_consumidos TEXT,
          FOREIGN KEY (produto_id) REFERENCES produtos(id)
        );
        CREATE INDEX IF NOT EXISTS idx_producao_ordens_prod ON producao_ordens(produto_id);
        CREATE INDEX IF NOT EXISTS idx_producao_ordens_num ON producao_ordens(numero);
        CREATE INDEX IF NOT EXISTS idx_producao_ordens_status ON producao_ordens(status);
      `);
      console.log('   ✔ Tabela producao_ordens criada com sucesso.');
    } else {
      console.log('   ℹ️ Tabela producao_ordens já existe.');
    }

    // 3. Tabela produtos: custo_adicional_producao
    const temCustoAdicional = await colunaExiste('produtos', 'custo_adicional_producao');
    if (!temCustoAdicional) {
      console.log('⚙️ [3/5] Adicionando coluna custo_adicional_producao na tabela produtos...');
      await execute('ALTER TABLE produtos ADD COLUMN custo_adicional_producao REAL DEFAULT 0');
      console.log('   ✔ Coluna custo_adicional_producao adicionada.');
    } else {
      console.log('   ℹ️ Coluna custo_adicional_producao já existe em produtos.');
    }

    // 4. Tabela produtos: tipo_item
    const temTipoItem = await colunaExiste('produtos', 'tipo_item');
    if (!temTipoItem) {
      console.log('⚙️ [4/5] Adicionando coluna tipo_item na tabela produtos...');
      await execute("ALTER TABLE produtos ADD COLUMN tipo_item TEXT DEFAULT 'SIMPLES'");
      console.log('   ✔ Coluna tipo_item adicionada.');
    } else {
      console.log('   ℹ️ Coluna tipo_item já existe em produtos.');
    }

    // 5. Configuração padrão do sistema: producao_permitir_saldo_negativo
    console.log('⚙️ [5/5] Verificando configuração producao_permitir_saldo_negativo...');
    const configExistente = await query("SELECT valor FROM configuracoes_sistema WHERE chave = 'producao_permitir_saldo_negativo'");
    if (configExistente.length === 0) {
      await execute("INSERT INTO configuracoes_sistema (chave, valor, data_atualizacao) VALUES ('producao_permitir_saldo_negativo', '0', datetime('now', 'localtime'))");
      console.log('   ✔ Configuração producao_permitir_saldo_negativo inicializada com 0 (bloqueio estrito).');
    } else {
      console.log(`   ℹ️ Configuração producao_permitir_saldo_negativo já configurada (valor atual: '${configExistente[0].valor}').`);
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ [SUCESSO] Migração de schema BOM e Produção concluída com êxito!');
    console.log('='.repeat(70));

    // Validação
    const colsProd = await query('PRAGMA table_info(produtos)');
    console.log('Colunas de produção em produtos:', colsProd.filter(c => ['custo_adicional_producao', 'tipo_item'].includes(c.name)).map(c => `${c.name} (${c.type})`));
  } catch (err) {
    console.error('❌ Falha na migração:', err);
    process.exit(1);
  }
}

main();
