/**
 * Script de Migração: Módulo Universal de Estoque & Ficha Kardex
 * Criação da tabela 'estoque_movimentacoes' e carga de inventário inicial.
 * Autor: Gustavo Rosa Informática
 * Ambiente: SQLite Local / Turso Cloud
 */

import { execute, query, run } from '../lib/db.js';

async function main() {
  console.log('='.repeat(70));
  console.log('📦 [MIGRAÇÃO ESTOQUE] Iniciando criação da infraestrutura da Ficha Kardex...');
  console.log('='.repeat(70));

  try {
    // 1. Criar a tabela universal de movimentações de estoque
    console.log('⚙️ [1/3] Criando tabela estoque_movimentacoes...');
    await execute(`
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
    `);
    console.log('   ✔ Tabela estoque_movimentacoes pronta.');

    // 2. Criar índices para consulta ultrarrápida do Kardex
    console.log('\n⚡ [2/3] Criando índices de alta performance...');
    await execute(`
      CREATE INDEX IF NOT EXISTS idx_estoque_mov_prod 
      ON estoque_movimentacoes(produto_id, data_movimentacao DESC);

      CREATE INDEX IF NOT EXISTS idx_estoque_mov_data 
      ON estoque_movimentacoes(data_movimentacao DESC);
    `);
    console.log('   ✔ Índices idx_estoque_mov_prod e idx_estoque_mov_data criados.');

    // 3. Carga do Inventário Inicial para produtos existentes (Idempotente)
    console.log('\n📊 [3/3] Verificando histórico de saldo inicial para produtos existentes...');
    const totalMov = await query('SELECT count(*) as total FROM estoque_movimentacoes');
    const totalAtual = totalMov && totalMov[0] ? (totalMov[0].total || 0) : 0;

    if (totalAtual === 0) {
      console.log('   ℹ️ Nenhum histórico encontrado. Gerando Ficha Kardex inicial...');
      const produtos = await query('SELECT id, codigo_sku, nome, preco_custo, estoque_atual FROM produtos');
      let inseridos = 0;

      for (const prod of produtos) {
        const saldo = Number(prod.estoque_atual) || 0;
        if (saldo > 0) {
          await run(`
            INSERT INTO estoque_movimentacoes (
              produto_id, tipo, origem, motivo, quantidade,
              saldo_anterior, saldo_posterior, custo_unitario,
              documento_referencia, observacoes, operador_nome, data_movimentacao
            ) VALUES (?, 'ENTRADA', 'INVENTARIO', 'INVENTARIO_INICIAL', ?, 0, ?, ?, 'BALANCO-INICIAL', 'Carga inicial de saldo patrimonial do sistema', 'Administrador (Sistema)', datetime('now', 'localtime'))
          `, [prod.id, saldo, saldo, prod.preco_custo || 0]);
          inseridos++;
        }
      }
      console.log(`   ✔ Carga concluída: ${inseridos} produtos receberam registro de saldo inicial na Ficha Kardex.`);
    } else {
      console.log(`   ✔ Tabela já contém ${totalAtual} movimentações registradas. Nenhuma ação necessária.`);
    }

    console.log('\n' + '='.repeat(70));
    console.log('🎉 [MIGRAÇÃO ESTOQUE] Concluída com 100% de sucesso!');
    console.log('='.repeat(70));

  } catch (err) {
    console.error('❌ [ERRO NA MIGRAÇÃO DE ESTOQUE]:', err);
    process.exit(1);
  }
}

main();
