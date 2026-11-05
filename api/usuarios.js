/**
 * Vercel Serverless Function: /api/usuarios
 * Gerenciador de Usuários e Permissões do Sistema
 * Apenas administradores ou usuários autorizados têm acesso a este endpoint
 */

import { query, get, run, registrarLog } from '../lib/db.js';
import { gerarHashSenha, validarTokenSessao, PAPEIS_SISTEMA } from '../lib/auth.js';

async function obterTodosPapeis() {
  const row = await get("SELECT valor FROM configuracoes_sistema WHERE chave = 'papeis_customizados'");
  let custom = {};
  if (row && row.valor) {
    try { custom = JSON.parse(row.valor); } catch {}
  }
  return { ...PAPEIS_SISTEMA, ...custom };
}

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

    // AÇÃO ADMINISTRATIVA: Redefinir senha de qualquer operador (Gustavo / Super Admin)
    const bodyRequisicao = (req.method === 'POST' || req.method === 'PUT') ? await parseBody(req) : {};
    if (bodyRequisicao.acao === 'redefinir_senha') {
      const targetId = bodyRequisicao.usuarioId || idParam || bodyRequisicao.id;
      if (!targetId) {
        return responder(res, 400, { error: 'ID do usuário não especificado.' });
      }

      const targetUser = await get('SELECT id, nome, login FROM usuarios WHERE id = ?', [targetId]);
      if (!targetUser) {
        return responder(res, 404, { error: 'Operador não encontrado.' });
      }

      const novaSenha = (bodyRequisicao.novaSenha || 'admin123').trim();
      if (!novaSenha || novaSenha.length < 4) {
        return responder(res, 400, { error: 'A senha deve conter no mínimo 4 caracteres.' });
      }

      const novoHash = gerarHashSenha(novaSenha);
      const agora = new Date().toISOString();
      const forcarTroca = bodyRequisicao.forcarTroca !== false ? 1 : 0;

      await run(`
        UPDATE usuarios 
        SET senha_hash = ?, data_atualizacao = ?, data_atualizacao_senha = NULL, exigir_troca_senha = ?
        WHERE id = ?
      `, [novoHash, agora, forcarTroca, targetId]);

      registrarLog({
        clienteId: operador.id,
        tipoAcao: 'ADMIN_RESET_SENHA',
        detalhes: `Administrador @${operador.login} redefiniu a senha do operador @${targetUser.login} (Nova senha: ${novaSenha} | Forçar troca: ${forcarTroca})`,
        req
      }).catch(() => {});

      return responder(res, 200, {
        success: true,
        mensagem: `Senha de @${targetUser.login} redefinida com sucesso para "${novaSenha}".`
      });
    }

    // AÇÕES DE GESTÃO DE PERFIS PERSONALIZADOS (RBAC)
    if (bodyRequisicao.acao === 'salvar_perfil') {
      const { chave, nome, cor, permissoes } = bodyRequisicao;
      if (!chave || !nome) {
        return responder(res, 400, { error: 'Identificador (chave) e Nome do perfil são obrigatórios.' });
      }
      const chaveFormatada = chave.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      const row = await get("SELECT valor FROM configuracoes_sistema WHERE chave = 'papeis_customizados'");
      let custom = {};
      if (row && row.valor) {
        try { custom = JSON.parse(row.valor); } catch {}
      }
      custom[chaveFormatada] = {
        nome: nome.trim(),
        cor: cor || '#38bdf8',
        permissoes: permissoes || {}
      };
      const agora = new Date().toISOString();
      await run(`
        INSERT INTO configuracoes_sistema (chave, valor, data_atualizacao)
        VALUES ('papeis_customizados', ?, ?)
        ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, data_atualizacao = excluded.data_atualizacao
      `, [JSON.stringify(custom), agora]);

      registrarLog({
        clienteId: operador.id,
        tipoAcao: 'PERFIL_RBAC_SALVO',
        detalhes: `Perfil ${nome} (${chaveFormatada}) configurado pelo Administrador @${operador.login}`,
        req
      }).catch(() => {});

      const todosPapeis = { ...PAPEIS_SISTEMA, ...custom };
      return responder(res, 200, { success: true, papeisDisponiveis: todosPapeis, mensagem: `Perfil "${nome}" salvo com sucesso!` });
    }

    if (bodyRequisicao.acao === 'excluir_perfil') {
      const { chave } = bodyRequisicao;
      if (!chave) return responder(res, 400, { error: 'Chave do perfil não informada.' });
      if (PAPEIS_SISTEMA[chave]) {
        return responder(res, 400, { error: 'Perfis padrão do sistema não podem ser excluídos.' });
      }
      const row = await get("SELECT valor FROM configuracoes_sistema WHERE chave = 'papeis_customizados'");
      let custom = {};
      if (row && row.valor) {
        try { custom = JSON.parse(row.valor); } catch {}
      }
      delete custom[chave];
      const agora = new Date().toISOString();
      await run(`
        INSERT INTO configuracoes_sistema (chave, valor, data_atualizacao)
        VALUES ('papeis_customizados', ?, ?)
        ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, data_atualizacao = excluded.data_atualizacao
      `, [JSON.stringify(custom), agora]);

      const todosPapeis = { ...PAPEIS_SISTEMA, ...custom };
      return responder(res, 200, { success: true, papeisDisponiveis: todosPapeis, mensagem: 'Perfil removido com sucesso!' });
    }

    // 1. GET: Listar usuários
    if (req.method === 'GET') {
      const todosPapeis = await obterTodosPapeis();
      const rows = await query(`
        SELECT id, nome, login, papel, permissoes, cliente_id, ativo, ultimo_login, data_cadastro, data_atualizacao_senha, exigir_troca_senha
        FROM usuarios
        ORDER BY papel ASC, nome ASC
      `);

      const lista = rows.map(u => {
        const papelInfo = todosPapeis[u.papel] || { nome: u.papel, cor: '#38bdf8' };
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
          data_cadastro: u.data_cadastro,
          data_atualizacao_senha: u.data_atualizacao_senha || null,
          exigir_troca_senha: u.exigir_troca_senha === 1
        };
      });

      return responder(res, 200, { success: true, usuarios: lista, papeisDisponiveis: todosPapeis });
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

      const existe = await get('SELECT id, ativo FROM usuarios WHERE LOWER(login) = ?', [login]);
      if (existe) {
        if (existe.ativo === 0) {
          // Reativação de operador previamente desativado
          const hash = gerarHashSenha(senha);
          const agora = new Date().toISOString();
          await run(`
            UPDATE usuarios
            SET nome = ?, senha_hash = ?, papel = ?, permissoes = ?, ativo = 1, data_atualizacao = ?, exigir_troca_senha = 0
            WHERE id = ?
          `, [nome, hash, papel, permissoes, agora, existe.id]);

          registrarLog({
            tipoAcao: 'USUARIO_REATIVADO',
            detalhes: `Usuário reativado pelo administrador: ${nome} (@${login}) | Papel: ${papel}`,
            req
          }).catch(() => {});

          return responder(res, 200, {
            success: true,
            id: existe.id,
            nome,
            login,
            papel,
            message: 'Usuário reativado e atualizado com sucesso'
          });
        }
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

      const todosPapeis = await obterTodosPapeis();
      const nome = body.nome !== undefined ? body.nome.trim() : usuarioAtual.nome;
      const papel = body.papel !== undefined ? body.papel.toUpperCase() : usuarioAtual.papel;
      const ativo = body.ativo !== undefined ? (body.ativo ? 1 : 0) : usuarioAtual.ativo;
      
      let permissoes = usuarioAtual.permissoes;
      if (body.permissoes !== undefined) {
        permissoes = JSON.stringify(body.permissoes);
      } else if (body.papel !== undefined && todosPapeis[papel]?.permissoes) {
        permissoes = JSON.stringify(todosPapeis[papel].permissoes);
      }

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

      const papelInfo = todosPapeis[papel] || {};
      registrarLog({
        tipoAcao: 'USUARIO_ALTERADO',
        detalhes: `Usuário atualizado: ${nome} (@${usuarioAtual.login}) | Perfil: ${papelInfo.nome || papel}`,
        req
      }).catch(() => {});

      return responder(res, 200, {
        success: true,
        message: `Usuário ${usuarioAtual.login} atualizado com sucesso!`,
        papel,
        papelNome: papelInfo.nome || papel,
        papelCor: papelInfo.cor || '#00d4ff',
        papeisDisponiveis: todosPapeis
      });
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

