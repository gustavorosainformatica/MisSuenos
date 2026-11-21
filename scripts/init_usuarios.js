import { execute, query, run } from '../lib/db.js';
import { gerarHashSenha, PAPEIS_SISTEMA } from '../lib/auth.js';

async function main() {
  const senhaInicial = String(process.env.ADMIN_INITIAL_PASSWORD || '');
  if (senhaInicial.length < 12) {
    throw new Error('Defina ADMIN_INITIAL_PASSWORD com pelo menos 12 caracteres no ambiente seguro.');
  }

  await execute(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      login TEXT UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL,
      papel TEXT NOT NULL DEFAULT 'OPERADOR',
      permissoes TEXT DEFAULT '{}', cliente_id INTEGER,
      ativo INTEGER DEFAULT 1, ultimo_login TEXT,
      data_cadastro TEXT NOT NULL, data_atualizacao TEXT,
      tamanho_pin INTEGER DEFAULT 4, tipo_credencial TEXT DEFAULT 'simples',
      exigir_troca_senha INTEGER DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_usuarios_login ON usuarios (login);
    CREATE INDEX IF NOT EXISTS idx_usuarios_papel ON usuarios (papel);
  `);

  const existente = (await query("SELECT id FROM usuarios WHERE LOWER(login) = 'admin'"))[0];
  if (existente) {
    console.log('[AUTH SEED] A conta admin já existe; nenhuma senha foi alterada.');
    return;
  }

  await run(`INSERT INTO usuarios
    (nome, login, senha_hash, papel, permissoes, ativo, data_cadastro, tamanho_pin, tipo_credencial, exigir_troca_senha)
    VALUES (?, 'admin', ?, 'ADMIN', ?, 1, ?, 4, 'simples', 1)`, [
    'ADMIN', gerarHashSenha(senhaInicial), JSON.stringify(PAPEIS_SISTEMA.ADMIN.permissoes), new Date().toISOString()
  ]);
  console.log('[AUTH SEED] Conta admin criada; troca de senha será exigida no primeiro acesso.');
}

main().catch((err) => {
  console.error('[AUTH SEED ERRO]', err.message);
  process.exitCode = 1;
});
