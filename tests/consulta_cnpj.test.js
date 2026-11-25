import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarCnpj, validarCnpj } from '../lib/validacoes_erp.js';
import { consultarEmpresa } from '../lib/consulta_cnpj.js';
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

test('CONSULTA CNPJ 01: normalizarCnpj remove pontuações, espaços e caracteres especiais', () => {
  assert.equal(normalizarCnpj('00.000.000/0001-91'), '00000000000191');
  assert.equal(normalizarCnpj('  12.345.678 / 0001-90  '), '12345678000190');
  assert.equal(normalizarCnpj('06990590000123'), '06990590000123');
});

test('CONSULTA CNPJ 02: validarCnpj valida dígitos verificadores Módulo 11 e rejeita inválidos', () => {
  // CNPJs válidos conhecidos
  assert.equal(validarCnpj('00000000000191'), true); // Banco do Brasil
  assert.equal(validarCnpj('06990590000123'), true); // Google Brasil
  assert.equal(validarCnpj('33000167000101'), true); // Petrobras

  // CNPJs inválidos
  assert.equal(validarCnpj('00000000000000'), false); // Repetidos
  assert.equal(validarCnpj('11111111111111'), false); // Repetidos
  assert.equal(validarCnpj('12345678000199'), false); // Dígitos verificadores incorretos
  assert.equal(validarCnpj('12345'), false);          // Incompleto
});

test('CONSULTA CNPJ 03: consultarEmpresa retorna 400 com mensagem clara para CNPJ inválido', async () => {
  const resultado = await consultarEmpresa('12345678000199');
  assert.equal(resultado.status, 400);
  assert.ok(resultado.dados.error);
  assert.match(resultado.dados.error, /Confira o CNPJ/i);
});

test('CONSULTA CNPJ 04: consultarEmpresa busca com sucesso dados de empresa válida (online)', async () => {
  // Consulta de CNPJ público corporativo estável (Banco do Brasil)
  const resultado = await consultarEmpresa('00000000000191');
  assert.equal(resultado.status, 200);
  assert.ok(resultado.dados.razao_social);
  assert.ok(resultado.dados.endereco);
  assert.equal(resultado.dados.endereco.uf, 'DF');
  assert.ok(resultado.dados.endereco.cep.length <= 8);
});

test('CONSULTA CNPJ 05: API GET /api/clientes?acao=consultar_cnpj despacha consulta com resposta JSON', async () => {
  const req = {
    method: 'GET',
    url: '/api/clientes?acao=consultar_cnpj&cnpj=00000000000191',
    headers: { host: 'localhost:3000' }
  };
  const res = criarMockRes();

  await handlerClientes(req, res);

  assert.equal(res.getStatusCode(), 200);
  const dados = res.getData();
  assert.ok(dados.razao_social);
  assert.match(dados.razao_social, /BANCO DO BRASIL/i);
  assert.ok(dados.endereco);
  assert.equal(dados.endereco.uf, 'DF');
});

test('CONSULTA CNPJ 06: API GET /api/clientes?acao=consultar_cnpj com CNPJ inválido retorna 400', async () => {
  const req = {
    method: 'GET',
    url: '/api/clientes?acao=consultar_cnpj&cnpj=00000000000000',
    headers: { host: 'localhost:3000' }
  };
  const res = criarMockRes();

  await handlerClientes(req, res);

  assert.equal(res.getStatusCode(), 400);
  const dados = res.getData();
  assert.ok(dados.error);
});
