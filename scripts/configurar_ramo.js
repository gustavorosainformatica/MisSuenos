/**
 * CLI de Setup Rápido de Ramo de Atividade (Camada 1 - White-Label Template)
 * Uso:
 *   npm run configurar-ramo -- --ramo=couros
 *   npm run configurar-ramo -- --ramo=informatica
 *   npm run configurar-ramo -- --ramo=comercio
 *   npm run configurar-ramo -- --ramo=oficina
 */
import { run, inicializarTabelas } from '../lib/db.js';
import { PRESETS_RAMO } from '../api/configuracoes.js';

async function configurarRamo() {
  const args = process.argv.slice(2);
  let ramoEscolhido = 'couros';

  for (const arg of args) {
    if (arg.startsWith('--ramo=')) {
      ramoEscolhido = arg.split('=')[1].trim().toLowerCase();
    } else if (!arg.startsWith('-')) {
      ramoEscolhido = arg.trim().toLowerCase();
    }
  }

  const preset = PRESETS_RAMO[ramoEscolhido];
  if (!preset) {
    console.error(`❌ Ramo "${ramoEscolhido}" inválido. Opções disponíveis: ${Object.keys(PRESETS_RAMO).join(', ')}`);
    process.exit(1);
  }

  console.log(`⚙️ Aplicando preset White-Label para o ramo: [${ramoEscolhido.toUpperCase()}]...`);

  try {
    await inicializarTabelas();

    const agora = new Date().toISOString();
    for (const [chave, valor] of Object.entries(preset)) {
      await run(
        `INSERT INTO configuracoes_sistema (chave, valor, data_atualizacao)
         VALUES (?, ?, ?)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, data_atualizacao = excluded.data_atualizacao`,
        [chave, String(valor), agora]
      );
    }

    console.log(`✅ Preset [${ramoEscolhido.toUpperCase()}] configurado com sucesso!`);
    console.log(`   • Nome Fantasia: ${preset.nome_fantasia}`);
    console.log(`   • Módulo Pedidos: ${preset.label_pedidos}`);
    console.log(`   • Módulo Produtos: ${preset.label_produtos}`);
    console.log(`   • Categorias: ${preset.categorias_padrao}`);
  } catch (err) {
    console.error('❌ Erro ao configurar ramo:', err.message);
    process.exit(1);
  }
}

configurarRamo();
