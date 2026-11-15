/**
 * Script de Migração: Múltiplas Tabelas de Preço (Varejo vs. Atacado)
 * Adiciona preco_atacado e qtd_minima_atacado em produtos, e tabela_preco em clientes.
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

async function main() {
  console.log('='.repeat(70));
  console.log('🏷️ [MIGRAÇÃO TABELAS DE PREÇO] Iniciando extensão de schema...');
  console.log('='.repeat(70));

  try {
    // 1. Tabela produtos: preco_atacado
    const temPrecoAtacado = await colunaExiste('produtos', 'preco_atacado');
    if (!temPrecoAtacado) {
      console.log('⚙️ [1/3] Adicionando coluna preco_atacado na tabela produtos...');
      await execute('ALTER TABLE produtos ADD COLUMN preco_atacado REAL DEFAULT NULL');
      console.log('   ✔ Coluna preco_atacado adicionada.');
    } else {
      console.log('   ℹ️ Coluna preco_atacado já existe em produtos.');
    }

    // 2. Tabela produtos: qtd_minima_atacado
    const temQtdMinima = await colunaExiste('produtos', 'qtd_minima_atacado');
    if (!temQtdMinima) {
      console.log('⚙️ [2/3] Adicionando coluna qtd_minima_atacado na tabela produtos...');
      await execute('ALTER TABLE produtos ADD COLUMN qtd_minima_atacado REAL DEFAULT 5.0');
      console.log('   ✔ Coluna qtd_minima_atacado adicionada.');
    } else {
      console.log('   ℹ️ Coluna qtd_minima_atacado já existe em produtos.');
    }

    // 3. Tabela clientes: tabela_preco
    const temTabelaPreco = await colunaExiste('clientes', 'tabela_preco');
    if (!temTabelaPreco) {
      console.log('⚙️ [3/5] Adicionando coluna tabela_preco na tabela clientes...');
      await execute("ALTER TABLE clientes ADD COLUMN tabela_preco TEXT DEFAULT 'VAREJO'");
      console.log('   ✔ Coluna tabela_preco adicionada.');
    } else {
      console.log('   ℹ️ Coluna tabela_preco já existe em clientes.');
    }

    // 4. Tabela pedidos: tabela_preco_aplicada
    const temTabelaPedido = await colunaExiste('pedidos', 'tabela_preco_aplicada');
    if (!temTabelaPedido) {
      console.log('⚙️ [4/5] Adicionando coluna tabela_preco_aplicada na tabela pedidos...');
      await execute("ALTER TABLE pedidos ADD COLUMN tabela_preco_aplicada TEXT DEFAULT 'VAREJO'");
      console.log('   ✔ Coluna tabela_preco_aplicada adicionada.');
    } else {
      console.log('   ℹ️ Coluna tabela_preco_aplicada já existe em pedidos.');
    }

    // 5. Tabela pedidos: itens_detalhados
    const temItensDetalhados = await colunaExiste('pedidos', 'itens_detalhados');
    if (!temItensDetalhados) {
      console.log('⚙️ [5/5] Adicionando coluna itens_detalhados na tabela pedidos...');
      await execute("ALTER TABLE pedidos ADD COLUMN itens_detalhados TEXT DEFAULT NULL");
      console.log('   ✔ Coluna itens_detalhados adicionada.');
    } else {
      console.log('   ℹ️ Coluna itens_detalhados já existe em pedidos.');
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ [SUCESSO] Migração de schema de tabelas de preço concluída!');
    console.log('='.repeat(70));

    // Validação final de schema
    const colunasProd = await query('PRAGMA table_info(produtos)');
    const colunasCli = await query('PRAGMA table_info(clientes)');
    console.log('Colunas de produtos para atacado:', colunasProd.filter(c => ['preco_atacado', 'qtd_minima_atacado'].includes(c.name)).map(c => `${c.name} (${c.type})`));
    console.log('Coluna de tabela_preco em clientes:', colunasCli.filter(c => c.name === 'tabela_preco').map(c => `${c.name} (${c.type})`));

  } catch (err) {
    console.error('❌ Falha na migração:', err);
    process.exit(1);
  }
}

main();
