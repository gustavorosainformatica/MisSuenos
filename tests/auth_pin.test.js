import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { inicializarTabelas, run, get } from '../lib/db.js';
import { gerarHashSenha, verificarSenha } from '../lib/auth.js';
import { criarSessao, validarTokenCsrf } from '../lib/sessoes.js';
import { garantirAcessoApi, permissaoDaRota } from '../lib/api_security.js';

function respostaFalsa() {
  return {
    statusCode: 0,
    dados: null,
    headers: {},
    setHeader(nome, valor) { this.headers[nome] = valor; return this; },
    status(codigo) { this.statusCode = codigo; return this; },
    json(dados) { this.dados = dados; return this; },
    writeHead(codigo) { this.statusCode = codigo; },
    end(texto) { try { this.dados = JSON.parse(texto); } catch {} }
  };
}

test('autenticação: hashes aleatórios validam senha sem armazenar senha pura', () => {
  const hash = gerarHashSenha('Senha Sintetica 46');
  assert.match(hash, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  assert.equal(verificarSenha('Senha Sintetica 46', hash), true);
  assert.equal(verificarSenha('outra senha', hash), false);
});

test('autenticação: rotas sensíveis têm política e falham fechadas sem sessão', async () => {
  await inicializarTabelas();
  for (const caminho of ['/api/clientes', '/api/financeiro', '/api/configuracoes', '/api/usuarios', '/api/logistica']) {
    assert.ok(permissaoDaRota('GET', caminho), `política ausente para ${caminho}`);
    const resposta = respostaFalsa();
    const permitido = await garantirAcessoApi({ method: 'GET', headers: {} }, resposta, caminho);
    assert.equal(permitido, false);
    assert.equal(resposta.statusCode, 401);
  }
  const resposta = respostaFalsa();
  assert.equal(await garantirAcessoApi({ method: 'GET', headers: {} }, resposta, '/api/rota-desconhecida'), false);
  assert.equal(resposta.statusCode, 403);
});

test('autenticação: sessão sintética exige CSRF para escrita e respeita permissões', async () => {
  await inicializarTabelas();
  const loginTeste = 'operador_teste_auth_seguro';
  await run('DELETE FROM usuarios WHERE login = ?', [loginTeste]);
  await run(`INSERT INTO usuarios (nome, login, senha_hash, papel, ativo, data_cadastro, permissoes)
    VALUES (?, ?, ?, ?, 1, ?, '{}')`, ['Operador Sintético', loginTeste, gerarHashSenha('Senha Sintetica 46'), 'VENDAS', new Date().toISOString()]);

  try {
    const operador = await get('SELECT id FROM usuarios WHERE login = ?', [loginTeste]);
    const sessao = await criarSessao(operador.id);
    const montarReq = csrf => ({
      method: 'POST',
      headers: { cookie: `erp_session=${encodeURIComponent(sessao.token)}`, ...(csrf ? { 'x-csrf-token': csrf } : {}) }
    });

    let resposta = respostaFalsa();
    assert.equal(await garantirAcessoApi(montarReq(), resposta, '/api/clientes'), false);
    assert.equal(resposta.statusCode, 403);

    const reqPermitida = montarReq(sessao.csrfToken);
    resposta = respostaFalsa();
    assert.equal(await garantirAcessoApi(reqPermitida, resposta, '/api/clientes'), true);
    assert.equal(reqPermitida.operador.id, operador.id);

    resposta = respostaFalsa();
    assert.equal(await garantirAcessoApi(montarReq(sessao.csrfToken), resposta, '/api/financeiro'), false);
    assert.equal(resposta.statusCode, 403);

    assert.equal(validarTokenCsrf(sessao, sessao.csrfToken), true);
    assert.equal(validarTokenCsrf(sessao, 'csrf-invalido'), false);
  } finally {
    await run('DELETE FROM sessoes_operadores WHERE usuario_id IN (SELECT id FROM usuarios WHERE login = ?)', [loginTeste]);
    await run('DELETE FROM usuarios WHERE login = ?', [loginTeste]);
  }
});

test('autenticação: troca de senha na tela inicial aplica carência de 30 dias para comum e libera para admin', async () => {
  await inicializarTabelas();
  const { default: handlerAuth } = await import('../api/auth.js');
  const loginComum = 'usuario_comum_teste';
  const loginAdmin = 'admin_teste_irrestrito';

  await run('DELETE FROM usuarios WHERE login IN (?, ?)', [loginComum, loginAdmin]);
  await run(`INSERT INTO usuarios (nome, login, senha_hash, papel, ativo, data_cadastro, permissoes)
    VALUES (?, ?, ?, 'VENDAS', 1, ?, '{}')`, ['Comum', loginComum, gerarHashSenha('senhaInicial123'), new Date().toISOString()]);
  await run(`INSERT INTO usuarios (nome, login, senha_hash, papel, ativo, data_cadastro, permissoes)
    VALUES (?, ?, ?, 'ADMIN', 1, ?, '{}')`, ['Admin', loginAdmin, gerarHashSenha('senhaAdmin123'), new Date().toISOString()]);

  try {
    // 1. Usuário comum troca senha pela 1ª vez -> Sucesso (200)
    let res = respostaFalsa();
    await handlerAuth({
      method: 'POST',
      body: { acao: 'trocar_senha_login', login: loginComum, senhaAtual: 'senhaInicial123', novaSenha: 'novaSenha456' }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.dados?.success, true);

    // 2. Usuário comum tenta trocar imediatamente de novo -> Bloqueado com 403 (carência de 30 dias)
    res = respostaFalsa();
    await handlerAuth({
      method: 'POST',
      body: { acao: 'trocar_senha_login', login: loginComum, senhaAtual: 'novaSenha456', novaSenha: 'outraSenha789' }
    }, res);
    assert.equal(res.statusCode, 403);
    assert.match(res.dados?.error || '', /1 vez ao mês/);

    // 3. Administrador troca senha pela 1ª vez -> Sucesso (200)
    res = respostaFalsa();
    await handlerAuth({
      method: 'POST',
      body: { acao: 'trocar_senha_login', login: loginAdmin, senhaAtual: 'senhaAdmin123', novaSenha: 'adminNova123' }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.dados?.success, true);

    // 4. Administrador troca novamente de imediato -> Sucesso (200) sem bloqueio de 30 dias!
    res = respostaFalsa();
    await handlerAuth({
      method: 'POST',
      body: { acao: 'trocar_senha_login', login: loginAdmin, senhaAtual: 'adminNova123', novaSenha: 'adminNova456' }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.dados?.success, true);
  } finally {
    await run('DELETE FROM sessoes_operadores WHERE usuario_id IN (SELECT id FROM usuarios WHERE login IN (?, ?))', [loginComum, loginAdmin]);
    await run('DELETE FROM usuarios WHERE login IN (?, ?)', [loginComum, loginAdmin]);
  }
});

test('autenticação: logout revoga sessão e limpa cookie mesmo sem token CSRF prévio', async () => {
  const { default: handlerAuth } = await import('../api/auth.js');
  const loginTeste = 'operador_teste_logout_' + Date.now();
  try {
    await run(`
      INSERT INTO usuarios (login, nome, senha_hash, papel, ativo, data_cadastro, permissoes)
      VALUES (?, ?, ?, 'VENDAS', 1, ?, '{}')
    `, [loginTeste, 'Operador Teste Logout', gerarHashSenha('senha123'), new Date().toISOString()]);

    const user = await get('SELECT id FROM usuarios WHERE login = ?', [loginTeste]);
    const sessao = await criarSessao(user.id);

    const res = respostaFalsa();
    await handlerAuth({
      method: 'POST',
      headers: { cookie: `erp_session=${sessao.token}` },
      body: { acao: 'logout' }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.dados?.success, true);
    assert.ok(res.headers['Set-Cookie'], 'Deve enviar cabeçalho Set-Cookie para limpar');
    const setCookie = Array.isArray(res.headers['Set-Cookie']) ? res.headers['Set-Cookie'].join('; ') : res.headers['Set-Cookie'];
    assert.match(setCookie, /Max-Age=0/);

    // Valida que a sessão foi revogada no banco
    const tokenHash = crypto.createHash('sha256').update(sessao.token).digest('hex');
    const sessaoDb = await get('SELECT revogada_em FROM sessoes_operadores WHERE token_hash = ?', [tokenHash]);
    assert.ok(sessaoDb && sessaoDb.revogada_em, 'Sessão deve estar revogada no banco');
  } finally {
    await run('DELETE FROM sessoes_operadores WHERE usuario_id IN (SELECT id FROM usuarios WHERE login = ?)', [loginTeste]);
    await run('DELETE FROM usuarios WHERE login = ?', [loginTeste]);
  }
});

test('autenticação: consultar_operador retorna exclusivamente a forma de credencial configurada e status de reset do admin', async () => {
  const { default: handlerAuth } = await import('../api/auth.js');
  const loginPin = 'user_pin_' + Date.now();
  const loginSenha = 'user_senha_' + Date.now();

  try {
    // 1. Cadastra usuário com PIN
    await run(`
      INSERT INTO usuarios (login, nome, senha_hash, papel, ativo, data_cadastro, tamanho_pin, tipo_credencial, exigir_troca_senha)
      VALUES (?, 'Operador PIN', ?, 'OPERADOR', 1, ?, 4, 'pin', 0)
    `, [loginPin, gerarHashSenha('1234'), new Date().toISOString()]);

    // 2. Cadastra usuário com Senha Alfanumérica
    await run(`
      INSERT INTO usuarios (login, nome, senha_hash, papel, ativo, data_cadastro, tamanho_pin, tipo_credencial, exigir_troca_senha)
      VALUES (?, 'Operador Senha', ?, 'OPERADOR', 1, ?, 6, 'simples', 0)
    `, [loginSenha, gerarHashSenha('senhaAlpha123'), new Date().toISOString()]);

    // Consulta usuário PIN -> deve retornar exclusivamente 'pin', tamanho 4, exigirTrocaSenha false
    let res = respostaFalsa();
    await handlerAuth({
      method: 'POST',
      body: { acao: 'consultar_operador', login: loginPin }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.dados?.tipoCredencial, 'pin');
    assert.equal(res.dados?.tamanhoPin, 4);
    assert.equal(res.dados?.exigirTrocaSenha, false);

    // Consulta usuário Senha -> deve retornar exclusivamente 'simples', exigirTrocaSenha false
    res = respostaFalsa();
    await handlerAuth({
      method: 'POST',
      body: { acao: 'consultar_operador', login: loginSenha }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.dados?.tipoCredencial, 'simples');
    assert.equal(res.dados?.exigirTrocaSenha, false);

    // Se admin reseta senha -> exigirTrocaSenha passa para true
    await run('UPDATE usuarios SET exigir_troca_senha = 1 WHERE login = ?', [loginPin]);
    res = respostaFalsa();
    await handlerAuth({
      method: 'POST',
      body: { acao: 'consultar_operador', login: loginPin }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.dados?.exigirTrocaSenha, true);
  } finally {
    await run('DELETE FROM usuarios WHERE login IN (?, ?)', [loginPin, loginSenha]);
  }
});

test('frontend: index.html oculta seletor e botões alternativos de PIN e Senha', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync('public/index.html', 'utf8');

  // Verifica que o seletor está oculto por padrão no HTML e CSS
  assert.ok(/#auth-seletor-modo-container\s*\{\s*display:\s*none\s*!important;/.test(html), 'CSS deve ocultar o seletor');
  assert.ok(html.includes('#tab-modo-senha.modo-oculto'), 'CSS deve ocultar tab de senha');
  assert.ok(html.includes('#tab-modo-pin.modo-oculto'), 'CSS deve ocultar tab de pin');

  // Verifica que os botões têm style display: none !important por padrão
  assert.ok(html.includes('id="tab-modo-senha" class="modo-oculto" onclick="alternarModoEntrada(\'simples\')" style="display: none !important;'), 'Botão de Senha deve ter display none');
  assert.ok(html.includes('id="tab-modo-pin" class="modo-oculto" onclick="alternarModoEntrada(\'pin\')" style="display: none !important;'), 'Botão de PIN deve ter display none');
});
