import { execute, query, run } from '../lib/db.js';
import { gerarHashSenha, PAPEIS_SISTEMA } from '../lib/auth.js';

async function main() {
  console.log('[AUTH SEED] Inicializando tabela de usuários...');

  // 1. Garante que a tabela existe
  await execute(`
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
      data_atualizacao TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_usuarios_login ON usuarios (login);
    CREATE INDEX IF NOT EXISTS idx_usuarios_papel ON usuarios (papel);
  `);

  // 2. Verifica se já existem usuários
  const totalRes = await query('SELECT COUNT(*) as total FROM usuarios');
  const total = Number(totalRes[0]?.total || totalRes[0]?.[0] || 0);
  console.log(`[AUTH SEED] Total de usuários já cadastrados: ${total}`);

  if (total === 0) {
    const agora = new Date().toISOString();

    const usuariosIniciais = [
      {
        nome: 'Administrador',
        login: 'marcos',
        senha: 'admin123',
        papel: 'ADMIN',
        permissoes: PAPEIS_SISTEMA.ADMIN.permissoes
      },
      {
        nome: 'Gustavo Rosa',
        login: 'gustavo',
        senha: 'admin123',
        papel: 'ADMIN',
        permissoes: PAPEIS_SISTEMA.ADMIN.permissoes
      },
      {
        nome: 'Rodrigo',
        login: 'rodrigo',
        senha: 'admin123',
        papel: 'ADMIN',
        permissoes: PAPEIS_SISTEMA.ADMIN.permissoes
      },
      {
        nome: 'Equipe de Vendas',
        login: 'vendas',
        senha: 'vendas123',
        papel: 'VENDAS',
        permissoes: PAPEIS_SISTEMA.VENDAS.permissoes
      },
      {
        nome: 'Equipe de Expedição',
        login: 'expedicao',
        senha: 'expedicao123',
        papel: 'EXPEDICAO',
        permissoes: PAPEIS_SISTEMA.EXPEDICAO.permissoes
      }
    ];

    for (const u of usuariosIniciais) {
      const hash = gerarHashSenha(u.senha);
      await run(`
        INSERT INTO usuarios (nome, login, senha_hash, papel, permissoes, ativo, data_cadastro)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `, [u.nome, u.login, hash, u.papel, JSON.stringify(u.permissoes), agora]);
      console.log(`[AUTH SEED] Usuário criado: ${u.nome} (Login: ${u.login}) | Senha padrão: ${u.senha}`);
    }

    console.log('[AUTH SEED] Usuários iniciais criados com sucesso!');
  } else {
    console.log('[AUTH SEED] A base já possui usuários configurados.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[AUTH SEED ERRO]', err);
  process.exit(1);
});

