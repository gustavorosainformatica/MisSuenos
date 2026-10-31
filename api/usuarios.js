/**
 * Vercel Serverless Function: /api/usuarios
 * Gerenciador de Usuários e Permissões do Sistema
 * Apenas administradores ou usuários autorizados têm acesso a este endpoint
 */

import { query, get, run, registrarLog } from '../lib/db.js';
import { gerarHashSenha, validarTokenSessao, PAPEIS_SISTEMA } from '../lib/auth.js';

function responder(res, status, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(data);
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return res.status(204).end();
    }
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    
    // Validação de token de operador
    const sessao = validarTokenSessao(token);
    if (!sessao) {
      return responder(res, 401, { error: 'Autenticação necessária' });
    }

    const operador = await get('SELECT id, nome, papel, permissoes FROM usuarios WHERE id = ?', [sessao.usuarioId]);
    if (!operador) {
      return responder(res, 403, { error: 'Acesso negado' });
    }

    // Apenas ADMIN pode gerenciar usuários
    if (operador.papel !== 'ADMIN') {
      return responder(res, 403, { error: 'Apenas Administradores podem gerenciar usuários do sistema' });
    }

    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const idParam = urlObj.searchParams.get('id');

    // 1. GET: Listar usuários
    if (req.method === 'GET') {
      const rows = await query(`
        SELECT id, nome, login, papel, permissoes, cliente_id, ativo, ultimo_login, data_cadastro
        FROM usuarios
        ORDER BY papel ASC, nome ASC
      `);

      const lista = rows.map(u => {
        const papelInfo = PAPEIS_SISTEMA[u.papel] || {};
        let perms = {};
        try { perms = typeof u.permissoes === 'string' ? JSON.parse(u.permissoes || '{}') : u.permissoes; } catch {}
        return {
          id: u.id,
          nome: u.nome,
          login: u.login,
          papel: u.papel,
          papelNome: papelInfo.nome || u.papel,
          papelCor: papelInfo.cor || '#00d4ff',
          permissoes: perms,
          ativo: u.ativo === 1,
          ultimo_login: u.ultimo_login,
          data_cadastro: u.data_cadastro
        };
      });

      return responder(res, 200, { success: true, usuarios: lista, papeisDisponiveis: PAPEIS_SISTEMA });
    }

    // 2. POST: Criar novo usuário
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const nome = (body.nome || '').trim();
      const login = (body.login || '').trim().toLowerCase();
      const senha = body.senha || '';
      const papel = (body.papel || 'VENDAS').toUpperCase();
      const permissoes = body.permissoes ? JSON.stringify(body.permissoes) : '{}';

      if (!nome || !login || !senha) {
        return responder(res, 400, { error: 'Nome, login e senha são obrigatórios' });
      }

      if (senha.length < 4) {
        return responder(res, 400, { error: 'A senha deve conter no mínimo 4 caracteres' });
      }

      const existe = await get('SELECT id FROM usuarios WHERE LOWER(login) = ?', [login]);
      if (existe) {
        return responder(res, 409, { error: 'Este login já está em uso por outro usuário' });
      }

      const hash = gerarHashSenha(senha);
      const agora = new Date().toISOString();

      const resInsert = await run(`
        INSERT INTO usuarios (nome, login, senha_hash, papel, permissoes, ativo, data_cadastro)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `, [nome, login, hash, papel, permissoes, agora]);

      registrarLog({
        tipoAcao: 'USUARIO_CRIADO',
        detalhes: `Novo usuário criado: ${nome} (${login}) | Papel: ${papel}`,
        req
      }).catch(() => {});

      return responder(res, 201, {
        success: true,
        id: resInsert.lastInsertRowid,
        nome,
        login,
        papel
      });
    }

    // 3. PUT: Atualizar usuário ou trocar senha
    if (req.method === 'PUT') {
      const body = await parseBody(req);
      const targetId = idParam || body.id;

      if (!targetId) {
        return responder(res, 400, { error: 'ID do usuário não especificado' });
      }

      const usuarioAtual = await get('SELECT * FROM usuarios WHERE id = ?', [targetId]);
      if (!usuarioAtual) {
        return responder(res, 404, { error: 'Usuário não encontrado' });
      }

      const nome = body.nome !== undefined ? body.nome.trim() : usuarioAtual.nome;
      const papel = body.papel !== undefined ? body.papel.toUpperCase() : usuarioAtual.papel;
      const ativo = body.ativo !== undefined ? (body.ativo ? 1 : 0) : usuarioAtual.ativo;
      const permissoes = body.permissoes !== undefined ? JSON.stringify(body.permissoes) : usuarioAtual.permissoes;
      const agora = new Date().toISOString();

      let novoHash = usuarioAtual.senha_hash;
      if (body.senha && body.senha.trim().length >= 4) {
        novoHash = gerarHashSenha(body.senha.trim());
      }

      await run(`
        UPDATE usuarios
        SET nome = ?, papel = ?, ativo = ?, permissoes = ?, senha_hash = ?, data_atualizacao = ?
        WHERE id = ?
      `, [nome, papel, ativo, permissoes, novoHash, agora, targetId]);

      registrarLog({
        tipoAcao: 'USUARIO_ALTERADO',
        detalhes: `Usuário atualizado: ${nome} (ID: ${targetId})`,
        req
      }).catch(() => {});

      return responder(res, 200, { success: true, message: 'Usuário atualizado com sucesso' });
    }

    // 4. DELETE: Desativar ou excluir usuário
    if (req.method === 'DELETE') {
      const targetId = idParam;
      if (!targetId) {
        return responder(res, 400, { error: 'ID do usuário não informado' });
      }

      if (parseInt(targetId, 10) === operador.id) {
        return responder(res, 400, { error: 'Você não pode desativar seu próprio usuário' });
      }

      await run('UPDATE usuarios SET ativo = 0 WHERE id = ?', [targetId]);

      registrarLog({
        tipoAcao: 'USUARIO_DESATIVADO',
        detalhes: `Usuário ID ${targetId} desativado pelo administrador ${operador.nome}`,
        req
      }).catch(() => {});

      return responder(res, 200, { success: true, message: 'Usuário desativado com sucesso' });
    }

    return responder(res, 405, { error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO USUARIOS API]', err);
    return responder(res, 500, { error: 'Falha ao gerenciar usuários: ' + err.message });
  }
}

