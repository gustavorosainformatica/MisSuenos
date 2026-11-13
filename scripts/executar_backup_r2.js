/**
 * Script CLI: Rotina Noturna Automática de Backup no Cloudflare R2
 * Autor: Gustavo Rosa Informática
 * Projeto: Mis Sueños ERP v2.0
 * 
 * Executa:
 * 1. Snapshot atômico do banco de dados (SQLite local / Turso Cloud).
 * 2. Compactação GZIP e upload para o Cloudflare R2 (ou fallback local).
 * 3. Política de retenção rotativa: expurgo de backups com mais de 30 dias.
 * 4. Registro formal na trilha de auditoria do sistema.
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gerarBackupSistema, listarBackupsSistema } from '../api/sistema.js';
import { deletarArquivo, getStorageStatus } from '../lib/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.join(__dirname, '..');

// Carrega .env se existir
try {
  const envPath = path.join(BASE_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const dotenv = await import('dotenv');
    dotenv.config({ path: envPath });
  }
} catch {}

const DIAS_RETENCAO_BACKUP = 30;

async function main() {
  console.log('='.repeat(70));
  console.log('🛡️ [ROTINA BACKUP R2] Iniciando backup automático do Mis Sueños ERP...');
  console.log('='.repeat(70));

  try {
    const storageInfo = getStorageStatus();
    console.log(`\n📦 [1/3] Provedor ativo de storage: ${storageInfo.provedor}`);
    if (storageInfo.provedor === 'CLOUDFLARE_R2') {
      console.log(`   Bucket R2: ${storageInfo.bucket}`);
    } else {
      console.log('   Armazenamento: Pasta local /public/uploads/backups/');
    }

    // 1. Gera snapshot e compacta
    console.log('\n⚙️ [2/3] Gerando snapshot atômico do banco e compactando GZIP...');
    const inicio = Date.now();
    const backupRes = await gerarBackupSistema({
      usuarioNome: 'CRON_NOTURNO'
    });
    const duracao = ((Date.now() - inicio) / 1000).toFixed(2);

    console.log(`   ✔ Arquivo gerado: ${backupRes.arquivo}`);
    console.log(`   ✔ Tamanho original: ${backupRes.tamanhoOriginalFormatado}`);
    console.log(`   ✔ Tamanho compactado: ${backupRes.tamanhoFormatado} (Economia: ${backupRes.taxaCompactacao})`);
    console.log(`   ✔ Tempo de execução: ${duracao}s`);
    console.log(`   ✔ URL de download: ${backupRes.urlDownload}`);

    // 2. Política de Retenção Rotativa (30 dias)
    console.log(`\n🧹 [3/3] Aplicando política de retenção rotativa (${DIAS_RETENCAO_BACKUP} dias)...`);
    const backupsList = await listarBackupsSistema();
    const agora = Date.now();
    const limiteMs = DIAS_RETENCAO_BACKUP * 24 * 60 * 60 * 1000;
    let expurgados = 0;

    for (const b of (backupsList.backups || [])) {
      const dataB = new Date(b.dataModificacao).getTime();
      if (!isNaN(dataB) && (agora - dataB) > limiteMs) {
        console.log(`   🗑️ Removendo backup expirado (> 30 dias): ${b.nomeArquivo}`);
        await deletarArquivo(b.key);
        expurgados++;
      }
    }

    if (expurgados === 0) {
      console.log(`   ✔ Nenhum backup anterior ultrapassou a retenção de ${DIAS_RETENCAO_BACKUP} dias.`);
    } else {
      console.log(`   ✔ Total de ${expurgados} backup(s) antigo(s) expurgado(s) com sucesso.`);
    }

    console.log(`   📊 Total de backups ativos no storage: ${backupsList.total}`);

    console.log('\n' + '='.repeat(70));
    console.log('🎉 [ROTINA BACKUP R2] Concluída com 100% de sucesso!');
    console.log('='.repeat(70));
    process.exit(0);
  } catch (err) {
    console.error('\n❌ [ERRO NA ROTINA DE BACKUP]:', err);
    process.exit(1);
  }
}

main();

