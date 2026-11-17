import { get, run, registrarLog } from '../lib/db.js';
import { verificarSenha, gerarHashSenha, ehHashSenhaLegado, PAPEIS_SISTEMA } from '../lib/auth.js';
import { permissoesDoUsuario } from '../lib/api_security.js';
import {
  criarSessao,
  validarSessaoRequisicao,
  validarTokenCsrf,
  revogarSessaoRequisicao,
  definirCookieSessao,
  limparCookieSessao
} from '../lib/sessoes.js';

function responder(res, status, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') return res.status(status).json(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  return res.end(JSON.stringify(data));
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  if (typeof req.on !== 'function') return {};
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function erroCsrf(res) {
  return responder(res, 403, { error: 'Validação de segurança inválida. Atualize a sessão e tente novamente.' });
}

function montarUsuarioPublico(user, permissoes) {
  const papelConfig = PAPEIS_SISTEMA[user.papel] || { nome: user.papel, cor: '#64748b' };
  return {
    id: user.id,
    nome: user.nome,
    login: user.login,
    papel: user.papel,
    papelNome: papelConfig.nome,
    papelCor: papelConfig.cor,
    permissoes,
    data_atualizacao_senha: user.data_atualizacao_senha || null,
    tamanhoPin: user.tamanho_pin || 6
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
      return res.status(204).end();
    }
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token'
    });
    return res.end();
  }

  try {
    const body = await parseBody(req);

    if (req.method === 'POST' && body.acao === 'logout') {
      const sessao = await validarSessaoRequisicao(req);
      if (sessao && !validarTokenCsrf(sessao, req.headers?.['x-csrf-token'])) return erroCsrf(res);
      if (sessao) await revogarSessaoRequisicao(req);
      limparCookieSessao(res);
      return responder(res, 200, { success: true });
    }

    if (req.method === 'POST' && body.acao === 'trocar_senha') {
      const sessao = await validarSessaoRequisicao(req);
      if (!sessao) return responder(res, 401, { error: 'Sessão inválida ou expirada. Faça login novamente.' });
      if (!validarTokenCsrf(sessao, req.headers?.['x-csrf-token'])) return erroCsrf(res);

      const user = await get('SELECT id, login, nome, senha_hash, papel, ativo, data_atualizacao_senha, exigir_troca_senha FROM usuarios WHERE id = ?', [sessao.usuarioId]);
      if (!user || Number(user.ativo) !== 1) return responder(res, 401, { error: 'Operador inativo ou inexistente.' });

      const trintaDias = 30 * 24 * 60 * 60 * 1000;
      if (user.exigir_troca_senha !== 1 && user.data_atualizacao_senha) {
        const ultimaTroca = Date.parse(user.data_atualizacao_senha);
        if (Number.isFinite(ultimaTroca) && Date.now() - ultimaTroca < trintaDias) {
          return responder(res, 403, { error: `Você poderá trocar a senha novamente em ${new Date(ultimaTroca + trintaDias).toLocaleDateString('pt-BR')}.` });
        }
      }

      if (body.senhaAtual && !verificarSenha(body.senhaAtual, user.senha_hash)) {
        return responder(res, 400, { error: 'A senha atual informada está incorreta.' });
      }
      const novaSenha = String(body.novaSenha || '').trim();
      const senhasPadrao = ['admin123', '123456', 'vendas123', 'expedicao123'];
      if (novaSenha.length < 4) return responder(res, 400, { error: 'A nova senha deve ter no mínimo 4 caracteres.' });
      if (senhasPadrao.includes(novaSenha.toLowerCase())) return responder(res, 400, { error: 'Escolha uma senha pessoal diferente das senhas padrão.' });

      const agora = new Date().toISOString();
      const tamanhoPin = novaSenha.length >= 4 && novaSenha.length <= 6 ? novaSenha.length : 6;
      await run(`UPDATE usuarios SET senha_hash = ?, data_atualizacao = ?, data_atualizacao_senha = ?, exigir_troca_senha = 0, tamanho_pin = ? WHERE id = ?`, [gerarHashSenha(novaSenha), agora, agora, tamanhoPin, user.id]);
      await run('UPDATE sessoes_operadores SET revogada_em = ? WHERE usuario_id = ? AND revogada_em IS NULL', [agora, user.id]);
      const novaSessao = await criarSessao(user.id);
      definirCookieSessao(res, req, novaSessao.token);
      registrarLog({ clienteId: user.id, tipoAcao: 'SENHA_ALTERADA', detalhes: `Senha alterada pelo operador @${user.login}.`, req }).catch(() => {});

      return responder(res, 200, {
        success: true,
        mensagem: 'Nova senha cadastrada com sucesso!',
        data_atualizacao_senha: agora,
        tamanhoPin,
        csrfToken: novaSessao.csrfToken,
        expiraEm: novaSessao.expiraEm
      });
    }

    if (req.method === 'GET' || (req.method === 'POST' && body.acao === 'me')) {
      const sessao = await validarSessaoRequisicao(req);
      if (!sessao) return responder(res, 401, { error: 'Sessão inválida ou expirada.' });
      const user = await get('SELECT id, nome, login, papel, permissoes, ativo, ultimo_login, data_atualizacao_senha, tamanho_pin, exigir_troca_senha FROM usuarios WHERE id = ?', [sessao.usuarioId]);
      if (!user || Number(user.ativo) !== 1) return responder(res, 401, { error: 'Operador inativo ou inexistente.' });
      const permissoes = await permissoesDoUsuario(user);
      return responder(res, 200, {
        autenticado: true,
        usuario: montarUsuarioPublico(user, permissoes),
        csrfToken: sessao.csrfToken,
        expiraEm: sessao.expiraEm,
        exigirTrocaSenha: Number(user.exigir_troca_senha) === 1
      });
    }

    if (req.method === 'POST' && !body.acao) {
      const login = String(body.login || '').trim().toLowerCase();
      const senha = String(body.senha || '');
      if (!login || !senha) return responder(res, 400, { error: 'Informe usuário e senha para acessar.' });

      const user = await get('SELECT * FROM usuarios WHERE LOWER(login) = ?', [login]);
      if (!user || Number(user.ativo) !== 1 || !verificarSenha(senha, user.senha_hash)) {
        registrarLog({ tipoAcao: 'LOGIN_FALHA', detalhes: 'Tentativa de autenticação não validada.', req }).catch(() => {});
        return responder(res, 401, { error: 'Usuário ou senha incorretos.' });
      }

      if (ehHashSenhaLegado(user.senha_hash)) {
        await run('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [gerarHashSenha(senha), user.id]);
      }
      const agora = new Date().toISOString();
      await run('UPDATE usuarios SET ultimo_login = ? WHERE id = ?', [agora, user.id]);
      const sessao = await criarSessao(user.id);
      definirCookieSessao(res, req, sessao.token);
      const permissoes = await permissoesDoUsuario(user);
      const senhasPadrao = ['admin123', '123456', 'vendas123', 'expedicao123'];
      const exigirTrocaSenha = Number(user.exigir_troca_senha) === 1 || senhasPadrao.includes(senha.toLowerCase());
      registrarLog({
        clienteId: user.id,
        clienteNome: user.nome,
        tipoAcao: 'LOGIN_SUCESSO',
        detalhes: `Login efetuado com sucesso | Papel: ${user.papel}${exigirTrocaSenha ? ' (troca de senha obrigatória)' : ''}`,
        req
      }).catch(() => {});

      return responder(res, 200, {
        success: true,
        csrfToken: sessao.csrfToken,
        expiraEm: sessao.expiraEm,
        exigirTrocaSenha,
        usuario: montarUsuarioPublico(user, permissoes)
      });
    }

    return responder(res, 405, { error: 'Método ou ação não permitidos.' });
  } catch (erro) {
    console.error('[ERRO AUTH API]', erro);
    return responder(res, 500, { error: 'Falha no serviço de autenticação.' });
  }
}
