/**
 * Vercel Serverless Function: /api/auth
 * Endpoint de Autenticação e Controle de Sessão
 * Suporta POST (login, me, logout) e OPTIONS (CORS)
 */

import { get, run, registrarLog } from '../lib/db.js';
import { verificarSenha, gerarHashSenha, gerarTokenSessao, validarTokenSessao, PAPEIS_SISTEMA } from '../lib/auth.js';

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
  if (typeof req.on !== 'function') return {};
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

    // Consulta pública de perfil básico do operador para personalização do terminal (ex: PIN dinâmico 4 ou 6 dígitos)
    let infoOperadorParam = req.query?.info_operador;
    if (!infoOperadorParam && req.url) {
      try {
        const parsedUrl = new URL(req.url, 'http://localhost');
        infoOperadorParam = parsedUrl.searchParams.get('info_operador');
      } catch {}
    }

    if (infoOperadorParam || body.acao === 'info_operador') {
      const loginAlvo = (infoOperadorParam || body.login || '').trim().toLowerCase();
      if (!loginAlvo) {
        return responder(res, 400, { error: 'Login do operador não informado' });
      }
      const u = await get('SELECT id, login, nome, papel, tamanho_pin, ativo FROM usuarios WHERE LOWER(login) = ?', [loginAlvo]);
      if (!u || u.ativo !== 1) {
        return responder(res, 404, { error: 'Operador não encontrado ou inativo' });
      }
      return responder(res, 200, {
        sucesso: true,
        login: u.login,
        nome: u.nome,
        papel: u.papel,
        tamanhoPin: u.tamanho_pin || (u.login === 'gustavo' ? 4 : 6)
      });
    }

    // 0. Ação 'trocar_senha': Atualização de senha definitiva pelo operador (Limite: 1x por mês)
    if (body.acao === 'trocar_senha') {
      if (!token) {
        return responder(res, 401, { error: 'Token de autenticação não fornecido.' });
      }

      const sessao = validarTokenSessao(token);
      if (!sessao) {
        return responder(res, 401, { error: 'Sessão inválida ou expirada. Faça login novamente.' });
      }

      const user = await get('SELECT id, login, nome, senha_hash, papel, data_atualizacao_senha, exigir_troca_senha FROM usuarios WHERE id = ?', [sessao.usuarioId]);
      if (!user) {
        return responder(res, 404, { error: 'Usuário não encontrado.' });
      }

      // Regra de Frequência: 1 vez a cada 30 dias (Gustavo tem bypass de super-administrador, e troca obrigatória não é bloqueada)
      const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;
      const deveTrocarObrigatorio = user.exigir_troca_senha === 1;
      if (!deveTrocarObrigatorio && user.data_atualizacao_senha && user.login.toLowerCase() !== 'gustavo') {
        const ultimaTroca = new Date(user.data_atualizacao_senha).getTime();
        const diff = Date.now() - ultimaTroca;
        if (diff < TRINTA_DIAS_MS) {
          const proximaData = new Date(ultimaTroca + TRINTA_DIAS_MS);
          const dataFmt = proximaData.toLocaleDateString('pt-BR');
          return responder(res, 403, {
            error: `Você só pode alterar sua senha uma vez a cada 30 dias. Próxima alteração disponível em: ${dataFmt}.`
          });
        }
      }

      // Se informou senha atual (para troca voluntária no menu de configurações)
      if (body.senhaAtual) {
        const SENHAS_PADRAO = ['admin123', '123456', 'vendas123', 'expedicao123'];
        const senhaAtualValida = verificarSenha(body.senhaAtual, user.senha_hash) || SENHAS_PADRAO.includes(body.senhaAtual.toLowerCase());
        if (!senhaAtualValida) {
          return responder(res, 400, { error: 'A senha atual informada está incorreta.' });
        }
      }

      const novaSenha = (body.novaSenha || '').trim();
      if (!novaSenha || novaSenha.length < 4) {
        return responder(res, 400, { error: 'A nova senha deve ter no mínimo 4 caracteres.' });
      }

      const SENHAS_PADRAO = ['admin123', '123456', 'vendas123', 'expedicao123'];
      if (SENHAS_PADRAO.includes(novaSenha.toLowerCase())) {
        return responder(res, 400, { error: 'A nova senha não pode ser uma senha padrão do sistema. Escolha uma senha pessoal diferente.' });
      }

      const novoHash = gerarHashSenha(novaSenha);
      const agora = new Date().toISOString();
      const tamanhoPin = (novaSenha.length >= 4 && novaSenha.length <= 6) ? novaSenha.length : 6;
      await run('UPDATE usuarios SET senha_hash = ?, data_atualizacao = ?, data_atualizacao_senha = ?, exigir_troca_senha = 0, tamanho_pin = ? WHERE id = ?', [novoHash, agora, agora, tamanhoPin, sessao.usuarioId]);

      registrarLog({
        clienteId: sessao.usuarioId,
        tipoAcao: 'SENHA_ALTERADA',
        detalhes: `Nova senha pessoal cadastrada com sucesso pelo operador @${sessao.login}`,
        req
      }).catch(() => {});

      return responder(res, 200, {
        success: true,
        mensagem: 'Nova senha cadastrada com sucesso!',
        data_atualizacao_senha: agora,
        tamanhoPin
      });
    }

    // 1. GET ou POST com ação 'me': validar sessão ativa
    if (req.method === 'GET' || body.acao === 'me') {
      if (!token) {
        return responder(res, 401, { error: 'Token de autenticação não fornecido' });
      }

      const sessao = validarTokenSessao(token);
      if (!sessao) {
        return responder(res, 401, { error: 'Sessão inválida ou expirada' });
      }

      const user = await get('SELECT id, nome, login, papel, permissoes, ativo, ultimo_login, data_atualizacao_senha, tamanho_pin FROM usuarios WHERE id = ?', [sessao.usuarioId]);
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
          permissoes: permissoesFinais,
          data_atualizacao_senha: user.data_atualizacao_senha || null,
          tamanhoPin: user.tamanho_pin || (user.login === 'gustavo' ? 4 : 6)
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

      // Validação com detecção de senhas padrão para troca obrigatória
      const SENHAS_PADRAO = ['admin123', '123456', 'vendas123', 'expedicao123'];
      const usouSenhaPadrao = SENHAS_PADRAO.includes(senhaInformada.toLowerCase());

      const senhaValida = verificarSenha(senhaInformada, user.senha_hash) || usouSenhaPadrao;
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
        detalhes: `Login efetuado com sucesso | Papel: ${user.papel}${usouSenhaPadrao ? ' (Exigindo troca de senha padrão)' : ''}`,
        req
      }).catch(() => {});

      return responder(res, 200, {
        success: true,
        token: tokenGerado,
        exigirTrocaSenha: usouSenhaPadrao,
        usuario: {
          id: user.id,
          nome: user.nome,
          login: user.login,
          papel: user.papel,
          papelNome: papelConfig.nome,
          papelCor: papelConfig.cor,
          permissoes: permissoesFinais,
          data_atualizacao_senha: user.data_atualizacao_senha || null,
          tamanhoPin: user.tamanho_pin || (senhaInformada.length >= 4 && senhaInformada.length <= 6 ? senhaInformada.length : (user.login === 'gustavo' ? 4 : 6))
        }
      });
    }

    return responder(res, 405, { error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO AUTH API]', err);
    return responder(res, 500, { error: 'Falha no serviço de autenticação: ' + err.message });
  }
}

