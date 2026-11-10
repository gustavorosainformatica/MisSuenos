import test from 'node:test';
import assert from 'node:assert/strict';
import handlerAuth from '../api/auth.js';
import { inicializarTabelas, run, get } from '../lib/db.js';
import { gerarTokenSessao } from '../lib/auth.js';

test('AUTH PIN 01: Inicialização da tabela e coluna tamanho_pin no banco', async () => {
  await inicializarTabelas();
  const gustavo = await get("SELECT login, tamanho_pin FROM usuarios WHERE login = 'gustavo'");
  assert.ok(gustavo, 'Usuário gustavo deve existir no banco');
  assert.equal(gustavo.tamanho_pin, 4, 'Gustavo deve possuir tamanho_pin = 4');

  const vendas = await get("SELECT login, tamanho_pin FROM usuarios WHERE login = 'vendas'");
  assert.ok(vendas, 'Usuário vendas deve existir no banco');
  assert.equal(vendas.tamanho_pin, 6, 'Vendas deve possuir tamanho_pin = 6 por padrão');
});

test('AUTH PIN 02: Endpoint info_operador via GET retorna o tamanho de PIN correto', async () => {
  let statusCode = 0;
  let responseData = null;

  const reqGustavo = {
    method: 'GET',
    url: '/api/auth?info_operador=gustavo',
    headers: {}
  };
  const resGustavo = {
    status(code) { statusCode = code; return this; },
    json(data) { responseData = data; return this; },
    writeHead(code) { statusCode = code; },
    end(str) { try { responseData = JSON.parse(str); } catch {} }
  };

  await handlerAuth(reqGustavo, resGustavo);
  assert.equal(statusCode, 200);
  assert.equal(responseData.sucesso, true);
  assert.equal(responseData.login, 'gustavo');
  assert.equal(responseData.tamanhoPin, 4);

  // Teste Vendas (6 dígitos)
  const reqVendas = {
    method: 'GET',
    url: '/api/auth?info_operador=vendas',
    headers: {}
  };
  await handlerAuth(reqVendas, resGustavo);
  assert.equal(statusCode, 200);
  assert.equal(responseData.login, 'vendas');
  assert.equal(responseData.tamanhoPin, 6);
});

test('AUTH PIN 03: Endpoint info_operador via POST (ação info_operador)', async () => {
  let statusCode = 0;
  let responseData = null;

  const req = {
    method: 'POST',
    url: '/api/auth',
    headers: { 'content-type': 'application/json' },
    body: { acao: 'info_operador', login: 'gustavo' }
  };
  const res = {
    status(code) { statusCode = code; return this; },
    json(data) { responseData = data; return this; },
    writeHead(code) { statusCode = code; },
    end(str) { try { responseData = JSON.parse(str); } catch {} }
  };

  await handlerAuth(req, res);
  assert.equal(statusCode, 200);
  assert.equal(responseData.sucesso, true);
  assert.equal(responseData.tamanhoPin, 4);
});

test('AUTH PIN 04: Troca de senha atualiza tamanho_pin em usuário isolado de teste (Zero Mutação no Gustavo)', async () => {
  // Cria usuário exclusivo e descartável para o teste não sobrescrever senhas de operadores reais
  await run("DELETE FROM usuarios WHERE login = 'test_operador_pin'");
  const resInsert = await run(`
    INSERT INTO usuarios (nome, login, senha_hash, papel, ativo, data_cadastro, tamanho_pin)
    VALUES ('Operador Teste', 'test_operador_pin', 'hash_temporario', 'OPERADOR', 1, '2026-11-10', 6)
  `);

  const userCriado = await get("SELECT id FROM usuarios WHERE login = 'test_operador_pin'");
  const token = gerarTokenSessao(userCriado.id, 'test_operador_pin');
  let statusCode = 0;
  let responseData = null;

  const req = {
    method: 'POST',
    url: '/api/auth',
    headers: { 'content-type': 'application/json' },
    body: {
      acao: 'trocar_senha',
      token,
      novaSenha: '9876'
    }
  };
  const res = {
    status(code) { statusCode = code; return this; },
    json(data) { responseData = data; return this; },
    writeHead(code) { statusCode = code; },
    end(str) { try { responseData = JSON.parse(str); } catch {} }
  };

  await handlerAuth(req, res);
  assert.equal(statusCode, 200);
  assert.equal(responseData.success, true);
  assert.equal(responseData.tamanhoPin, 4);

  const user = await get("SELECT tamanho_pin FROM usuarios WHERE login = 'test_operador_pin'");
  assert.equal(user.tamanho_pin, 4);

  // Limpeza: remove o usuário de teste
  await run("DELETE FROM usuarios WHERE login = 'test_operador_pin'");
});
