/**
 * Script de Migração: Evolução da Tabela logs_auditoria (Fase 2)
 * Autor: Gustavo Rosa Informática
 * Projeto: Mis Sueños ERP
 * 
 * Adiciona idempotentemente colunas ricas e índices de telemetria
 * para o SQLite local e Turso Cloud.
 */

import { execute, query } from '../lib/db.js';

async function main() {
  console.log('='.repeat(70));
  console.log('🛡️ [MIGRAÇÃO AUDITORIA] Iniciando adequação do schema de logs_auditoria...');
  console.log('='.repeat(70));

  try {
    // 1. Obter colunas existentes
    const colunasInfo = await query('PRAGMA table_info(logs_auditoria)');
    const colunasExistentes = new Set(colunasInfo.map(c => c.name.toLowerCase()));

    const colunasParaAdicionar = [
      { nome: 'usuario_id', tipo: 'INTEGER' },
      { nome: 'usuario_nome', tipo: 'TEXT' },
      { nome: 'modulo', tipo: "TEXT DEFAULT 'GERAL'" },
      { nome: 'referencia_id', tipo: 'TEXT' },
      { nome: 'descricao', tipo: 'TEXT' },
      { nome: 'dados_anteriores', tipo: 'TEXT' },
      { nome: 'dados_novos', tipo: 'TEXT' }
    ];

    console.log('\n🔍 [1/3] Verificando colunas da tabela logs_auditoria...');
    let adicionadas = 0;

    for (const col of colunasParaAdicionar) {
      if (!colunasExistentes.has(col.nome.toLowerCase())) {
        console.log(`   ➕ Adicionando coluna ${col.nome} (${col.tipo})...`);
        await execute(`ALTER TABLE logs_auditoria ADD COLUMN ${col.nome} ${col.tipo}`);
        adicionadas++;
      } else {
        console.log(`   ✔ Coluna '${col.nome}' já existe.`);
      }
    }

    if (adicionadas > 0) {
      console.log(`   ✔ Total de ${adicionadas} colunas adicionadas com sucesso.`);
    } else {
      console.log('   ✔ Todas as colunas necessárias já estão presentes.');
    }

    // 2. Criar índices de consulta de alta performance
    console.log('\n⚡ [2/3] Criando índices para consultas e filtros de auditoria...');
    await execute(`
      CREATE INDEX IF NOT EXISTS idx_logs_modulo_data ON logs_auditoria (modulo, data_hora);
      CREATE INDEX IF NOT EXISTS idx_logs_usuario ON logs_auditoria (usuario_id);
      CREATE INDEX IF NOT EXISTS idx_logs_referencia ON logs_auditoria (referencia_id);
    `);
    console.log('   ✔ Índices idx_logs_modulo_data, idx_logs_usuario e idx_logs_referencia criados/verificados.');

    // 3. Atualizar registros antigos sem módulo para 'GERAL'
    console.log('\n📝 [3/3] Normalizando registros históricos...');
    await execute("UPDATE logs_auditoria SET modulo = 'GERAL' WHERE modulo IS NULL OR modulo = ''");
    console.log('   ✔ Registros históricos normalizados com sucesso.');

    console.log('\n' + '='.repeat(70));
    console.log('🎉 [MIGRAÇÃO AUDITORIA] Concluída com 100% de sucesso!');
    console.log('='.repeat(70));
  } catch (err) {
    console.error('❌ [ERRO NA MIGRAÇÃO DE AUDITORIA]:', err.message);
    process.exit(1);
  }
}

main();
