import test from 'node:test';
import assert from 'node:assert/strict';
import { inicializarTabelas, run, get } from '../lib/db.js';
import { gerarHashSenha, verificarSenha } from '../lib/auth.js';
import { criarSessao, validarTokenCsrf } from '../lib/sessoes.js';
import { garantirAcessoApi, permissaoDaRota } from '../lib/api_security.js';

function respostaFalsa() {
  return {
    statusCode: 0,
    dados: null,
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
