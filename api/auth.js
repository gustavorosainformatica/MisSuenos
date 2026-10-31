/**
 * Vercel Serverless Function: /api/auth
 * Endpoint de Autenticação e Controle de Sessão
 * Suporta POST (login, me, logout) e OPTIONS (CORS)
 */

import { get, run, registrarLog } from '../lib/db.js';
import { verificarSenha, gerarTokenSessao, validarTokenSessao, PAPEIS_SISTEMA } from '../lib/auth.js';

function responder(res, status, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(data);
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return res.status(204).end();
    }
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  try {
    const body = await parseBody(req);
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const token = body.token || bearerToken;

    // 1. GET ou POST com ação 'me': validar sessão ativa
    if (req.method === 'GET' || body.acao === 'me') {
      if (!token) {
        return responder(res, 401, { error: 'Token de autenticação não fornecido' });
      }

      const sessao = validarTokenSessao(token);
      if (!sessao) {
        return responder(res, 401, { error: 'Sessão inválida ou expirada' });
      }

      const user = await get('SELECT id, nome, login, papel, permissoes, ativo, ultimo_login FROM usuarios WHERE id = ?', [sessao.usuarioId]);
      if (!user || user.ativo !== 1) {
        return responder(res, 401, { error: 'Usuário inativo ou inexistente' });
      }

      let permissoesObj = {};
      try {
        permissoesObj = typeof user.permissoes === 'string' ? JSON.parse(user.permissoes || '{}') : user.permissoes;
      } catch {}

      // Mescla com permissões padrão do papel se vazio
      const papelConfig = PAPEIS_SISTEMA[user.papel] || PAPEIS_SISTEMA.ADMIN;
      const permissoesFinais = { ...papelConfig.permissoes, ...permissoesObj };

      return responder(res, 200, {
        autenticado: true,
        usuario: {
          id: user.id,
          nome: user.nome,
          login: user.login,
          papel: user.papel,
          papelNome: papelConfig.nome,
          papelCor: papelConfig.cor,
          permissoes: permissoesFinais
        }
      });
    }

    // 2. POST de Login
    if (req.method === 'POST') {
      const loginInformado = (body.login || '').trim().toLowerCase();
      const senhaInformada = body.senha || '';

      if (!loginInformado || !senhaInformada) {
        return responder(res, 400, { error: 'Informe usuário e senha para acessar' });
      }

      const user = await get('SELECT * FROM usuarios WHERE LOWER(login) = ?', [loginInformado]);
      if (!user) {
        registrarLog({
          tipoAcao: 'LOGIN_FALHA',
          detalhes: `Tentativa de login para usuário inexistente: ${loginInformado}`,
          req
        }).catch(() => {});
        return responder(res, 401, { error: 'Usuário ou senha incorretos' });
      }

      if (user.ativo !== 1) {
        return responder(res, 403, { error: 'Este usuário está desativado. Contate o administrador.' });
      }

      const senhaValida = verificarSenha(senhaInformada, user.senha_hash);
      if (!senhaValida) {
        registrarLog({
          clienteId: user.id,
          clienteNome: user.nome,
          tipoAcao: 'LOGIN_FALHA',
          detalhes: `Senha incorreta para o login: ${loginInformado}`,
          req
        }).catch(() => {});
        return responder(res, 401, { error: 'Usuário ou senha incorretos' });
      }

      // Atualiza data do último login
      const agora = new Date().toISOString();
      await run('UPDATE usuarios SET ultimo_login = ? WHERE id = ?', [agora, user.id]);

      const tokenGerado = gerarTokenSessao(user.id, user.login);
      const papelConfig = PAPEIS_SISTEMA[user.papel] || PAPEIS_SISTEMA.ADMIN;

      let permissoesObj = {};
      try {
        permissoesObj = typeof user.permissoes === 'string' ? JSON.parse(user.permissoes || '{}') : user.permissoes;
      } catch {}
      const permissoesFinais = { ...papelConfig.permissoes, ...permissoesObj };

      registrarLog({
        clienteId: user.id,
        clienteNome: user.nome,
        tipoAcao: 'LOGIN_SUCESSO',
        detalhes: `Login efetuado com sucesso | Papel: ${user.papel}`,
        req
      }).catch(() => {});

      return responder(res, 200, {
        success: true,
        token: tokenGerado,
        usuario: {
          id: user.id,
          nome: user.nome,
          login: user.login,
          papel: user.papel,
          papelNome: papelConfig.nome,
          papelCor: papelConfig.cor,
          permissoes: permissoesFinais
        }
      });
    }

    return responder(res, 405, { error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO AUTH API]', err);
    return responder(res, 500, { error: 'Falha no serviço de autenticação: ' + err.message });
  }
}

