import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../lib/db.js';
import handlerClientes from '../api/clientes.js';

function criarMockRes() {
  let statusCode = 200;
  let responseData = null;
  const headers = {};
  return {
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    writeHead(code, hdrs = {}) {
      statusCode = code;
      Object.assign(headers, hdrs);
      return this;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    end(data) {
      if (data) {
        try {
          responseData = JSON.parse(data);
        } catch {
          responseData = data;
        }
      }
      return this;
    },
    getStatusCode() { return statusCode; },
    getData() { return responseData; }
  };
}

test('CLIENTES API 01: POST /api/clientes deve persistir novo cliente com 24 colunas no banco sem erro de placeholder', async () => {
  await db.inicializarTabelas();

  const countAntesRes = await db.get('SELECT count(*) as total FROM clientes');
  const totalAntes = Number(countAntesRes.total);

  // Cria cliente de teste sintético (Zero PII)
  const reqPost = {
    method: 'POST',
    url: '/api/clientes',
    headers: { host: 'localhost:3000' },
    body: {
      nome: 'CLIENTE TESTE PERSISTENCIA TDD',
      apelido_referencia: 'TESTE PERSISTENCIA',
      razao_social: 'EMPRESA TESTE LTDA',
      cpf: '000.000.001-91',
      cnpj: '',
      ie: 'ISENTO',
      telefone: '(55) 99999-0000',
      email: 'teste@exemplo.com.br',
      logradouro: 'RUA TESTE',
      numero: '100',
      complemento: 'SALA 1',
      bairro: 'CENTRO',
      cidade: 'SAO BORJA',
      uf: 'RS',
      cep: '97670-000',
      observacoes: 'Cliente inserido pelo teste automatizado TDD',
      preferencias: 'Couros naturais'
    }
  };
  const resPost = criarMockRes();

  await handlerClientes(reqPost, resPost);

  assert.strictEqual(resPost.getStatusCode(), 201, 'Deve responder HTTP 201 Created');
  const dataPost = resPost.getData();
  assert.strictEqual(dataPost.success, true);
  assert.ok(dataPost.id, 'Deve retornar o ID do cliente criado');

  const novoId = dataPost.id;

  // 1. Valida que o total de clientes aumentou exatamente em 1 no banco
  const countDepoisRes = await db.get('SELECT count(*) as total FROM clientes');
  const totalDepois = Number(countDepoisRes.total);
  assert.strictEqual(totalDepois, totalAntes + 1, 'Total de clientes no banco deve incrementar em 1');

  // 2. Valida consulta direta no banco
  const clienteNoBanco = await db.get('SELECT * FROM clientes WHERE id = ?', [novoId]);
  assert.ok(clienteNoBanco, 'Registro do novo cliente deve existir no banco de dados');
  assert.strictEqual(clienteNoBanco.nome, 'CLIENTE TESTE PERSISTENCIA TDD');
  assert.strictEqual(clienteNoBanco.cidade, 'SAO BORJA');
  assert.strictEqual(clienteNoBanco.uf, 'RS');
  assert.strictEqual(clienteNoBanco.preferencias, 'Couros naturais');

  // 3. Valida busca via GET /api/clientes?id=...
  const reqGet = {
    method: 'GET',
    url: `/api/clientes?id=${novoId}`,
    headers: { host: 'localhost:3000' },
    query: { id: String(novoId) }
  };
  const resGet = criarMockRes();
  await handlerClientes(reqGet, resGet);
  assert.strictEqual(resGet.getStatusCode(), 200);
  const dataGet = resGet.getData();
  assert.strictEqual(dataGet.id, novoId);
  assert.strictEqual(dataGet.nome, 'CLIENTE TESTE PERSISTENCIA TDD');

  // 4. Limpeza pós-teste (mantém banco limpo e sem poluição)
  await db.run('DELETE FROM logs_auditoria WHERE cliente_id = ?', [novoId]);
  await db.run('DELETE FROM clientes WHERE id = ?', [novoId]);

  const countFinalRes = await db.get('SELECT count(*) as total FROM clientes');
  assert.strictEqual(Number(countFinalRes.total), totalAntes, 'Contagem deve retornar ao valor original após limpeza');
});
