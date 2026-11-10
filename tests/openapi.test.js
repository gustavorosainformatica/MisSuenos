import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

test('OPENAPI TDD 01: Arquivo openapi.json existe e é um JSON válido', () => {
  const filePath = path.resolve('public', 'openapi.json');
  assert.ok(fs.existsSync(filePath), 'public/openapi.json DEVE existir');

  const raw = fs.readFileSync(filePath, 'utf8');
  let json = null;
  assert.doesNotThrow(() => {
    json = JSON.parse(raw);
  }, 'public/openapi.json DEVE ser um JSON sintaticamente válido');

  assert.ok(json.openapi.startsWith('3.0'), 'Versão da especificação OpenAPI DEVE ser 3.0.x');
  assert.ok(json.info && json.info.title, 'DEVE conter seção info com título');
  assert.ok(json.paths && Object.keys(json.paths).length >= 10, 'DEVE conter no mínimo 10 endpoints documentados');
});

test('OPENAPI TDD 02: Cobertura dos módulos críticos do ERP', () => {
  const filePath = path.resolve('public', 'openapi.json');
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  const paths = Object.keys(json.paths);
  assert.ok(paths.includes('/api/pedidos'), 'DEVE conter rota /api/pedidos');
  assert.ok(paths.includes('/api/pedidos/{id}'), 'DEVE conter rota /api/pedidos/{id}');
  assert.ok(paths.includes('/api/clientes'), 'DEVE conter rota /api/clientes');
  assert.ok(paths.includes('/api/produtos'), 'DEVE conter rota /api/produtos');
  assert.ok(paths.includes('/api/financeiro'), 'DEVE conter rota /api/financeiro');
  assert.ok(paths.includes('/api/relatorios/dre_gerencial'), 'DEVE conter rota do DRE analítico');
  assert.ok(paths.includes('/api/logistica/rastreio/{codigo}'), 'DEVE conter rota de logística e rastreio');
});

test('OPENAPI TDD 03: Presença do status AGUARDANDO_PAGAMENTO nos schemas de Pedidos', () => {
  const filePath = path.resolve('public', 'openapi.json');
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  const schemaPedido = json.components.schemas.Pedido;
  assert.ok(schemaPedido, 'Schema Pedido deve existir');
  const enumStatus = schemaPedido.properties.status.enum;
  assert.ok(Array.isArray(enumStatus), 'Status deve possuir enum');
  assert.ok(enumStatus.includes('AGUARDANDO_PAGAMENTO'), 'Enum DEVE conter AGUARDANDO_PAGAMENTO');
  assert.strictEqual(enumStatus[0], 'AGUARDANDO_PAGAMENTO', 'Primeiro status DEVE ser AGUARDANDO_PAGAMENTO');
});

test('OPENAPI TDD 04: Esquemas de segurança para API fechada', () => {
  const filePath = path.resolve('public', 'openapi.json');
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  assert.ok(json.components.securitySchemes, 'DEVE possuir esquemas de segurança');
  assert.ok(json.components.securitySchemes.ApiKeyAuth, 'DEVE conter esquema ApiKeyAuth (X-API-KEY)');
  assert.ok(json.components.securitySchemes.BearerAuth, 'DEVE conter esquema BearerAuth');
});

test('OPENAPI TDD 05: Interface do Scalar api-docs.html existe e está configurada', () => {
  const htmlPath = path.resolve('public', 'api-docs.html');
  assert.ok(fs.existsSync(htmlPath), 'public/api-docs.html DEVE existir');

  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(html.includes('@scalar/api-reference'), 'DEVE carregar o script do Scalar API Reference');
  assert.ok(html.includes('openapi.json'), 'DEVE referenciar o arquivo openapi.json');
  assert.ok(html.includes('deepSpace'), 'DEVE usar o tema dark deepSpace');
});
