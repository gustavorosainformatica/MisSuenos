import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../lib/db.js';

test('TICKET 01 - DB: Tabela fornecedores_produtos_vinculo existe e impõe UNIQUE(fornecedor_id, codigo_fornecedor)', async () => {
  const fornecedorId = 99999;
  const codigoFornecedor = 'TEST_SKU_VINCO_001';

  // Limpa resquícios se houver
  await db.run('DELETE FROM fornecedores_produtos_vinculo WHERE fornecedor_id = ? AND codigo_fornecedor = ?', [fornecedorId, codigoFornecedor]);

  // Inserção bem-sucedida
  const res = await db.run(`
    INSERT INTO fornecedores_produtos_vinculo (
      fornecedor_id, codigo_fornecedor, ean_fornecedor, descricao_fornecedor, produto_erp_id, fator_conversao, unidade_fornecedor
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [fornecedorId, codigoFornecedor, '7891234567890', 'PRODUTO TESTE VINCULO', 1, 2.5, 'CX']);

  assert.ok(res.lastInsertRowid || res.rowsAffected > 0, 'Inserção deve ter sucesso');

  // Consulta e validação de campos
  const registro = await db.get(`
    SELECT * FROM fornecedores_produtos_vinculo WHERE fornecedor_id = ? AND codigo_fornecedor = ?
  `, [fornecedorId, codigoFornecedor]);

  assert.ok(registro, 'Registro inserido deve ser recuperado');
  assert.strictEqual(registro.fornecedor_id, fornecedorId);
  assert.strictEqual(registro.codigo_fornecedor, codigoFornecedor);
  assert.strictEqual(Number(registro.fator_conversao), 2.5);
  assert.strictEqual(registro.unidade_fornecedor, 'CX');

  // Inserção duplicada deve estourar erro de restrição UNIQUE
  await assert.rejects(async () => {
    await db.run(`
      INSERT INTO fornecedores_produtos_vinculo (
        fornecedor_id, codigo_fornecedor, descricao_fornecedor, produto_erp_id
      ) VALUES (?, ?, ?, ?)
    `, [fornecedorId, codigoFornecedor, 'PRODUTO DUPLICADO', 1]);
  }, /UNIQUE/i, 'Deve rejeitar duplicidade de (fornecedor_id, codigo_fornecedor)');

  // Limpeza
  await db.run('DELETE FROM fornecedores_produtos_vinculo WHERE fornecedor_id = ? AND codigo_fornecedor = ?', [fornecedorId, codigoFornecedor]);
});

test('TICKET 01 - DB: Tabela transportadoras_config contém as 4 transportadoras homologadas', async () => {
  const transportadoras = await db.query('SELECT id, nome, ativo, padrao, ambiente FROM transportadoras_config');
  assert.ok(Array.isArray(transportadoras), 'Deve retornar lista de transportadoras');

  const ids = transportadoras.map(t => t.id);
  assert.ok(ids.includes('melhor_envio'), 'Deve conter melhor_envio');
  assert.ok(ids.includes('superfrete'), 'Deve conter superfrete');
  assert.ok(ids.includes('correios_cws'), 'Deve conter correios_cws');
  assert.ok(ids.includes('frenet'), 'Deve conter frenet');

  const melhorEnvio = transportadoras.find(t => t.id === 'melhor_envio');
  assert.strictEqual(Number(melhorEnvio.ativo), 1, 'Melhor Envio deve vir ativo por padrão');
  assert.strictEqual(Number(melhorEnvio.padrao), 1, 'Melhor Envio deve ser o provedor padrão inicial');
});

test('TICKET 01 - DB: Tabela conciliacao_extratos existe e impõe UNIQUE no fitid', async () => {
  const fitidTeste = 'FITID_TDD_TEST_99999';

  // Limpeza
  await db.run('DELETE FROM conciliacao_extratos WHERE fitid = ?', [fitidTeste]);

  // Inserção inicial
  await db.run(`
    INSERT INTO conciliacao_extratos (
      origem, fitid, data_transacao, descricao, tipo, valor, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, ['OFX', fitidTeste, '2026-11-10', 'TRANSF PIX RECEBIDA', 'CREDITO', 250.00, 'PENDENTE']);

  const row = await db.get('SELECT * FROM conciliacao_extratos WHERE fitid = ?', [fitidTeste]);
  assert.ok(row, 'Extrato inserido deve ser encontrado');
  assert.strictEqual(row.fitid, fitidTeste);
  assert.strictEqual(Number(row.valor), 250.00);

  // Inserção com mesmo fitid deve falhar
  await assert.rejects(async () => {
    await db.run(`
      INSERT INTO conciliacao_extratos (
        origem, fitid, data_transacao, descricao, tipo, valor
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, ['OFX', fitidTeste, '2026-11-10', 'TRANSF PIX DUPLICADA', 'CREDITO', 250.00]);
  }, /UNIQUE/i, 'Deve rejeitar fitid duplicado');

  // Limpeza
  await db.run('DELETE FROM conciliacao_extratos WHERE fitid = ?', [fitidTeste]);
});

test('TICKET 01 - DB: Tabela fiscal_config contém configuração padrão inicial', async () => {
  const config = await db.get('SELECT * FROM fiscal_config WHERE id = 1');
  assert.ok(config, 'Configuração fiscal inicial id=1 deve existir');
  assert.ok(['homologacao', 'producao'].includes(config.ambiente), 'Ambiente fiscal deve ser homologação ou produção');
  assert.ok(['wlg', 'focus', 'nativo'].includes(config.driver_ativo), 'Driver ativo deve ser homologado');
  assert.strictEqual(Number(config.serie_nfe), 1, 'Série NF-e padrão deve ser 1');
});

test('TICKET 01 - DB: Tabela fiscal_documentos aceita inserção e rejeita duplicidade de chave_acesso', async () => {
  const chaveTeste = '35261100000000000000550010000000011000000099';

  // Limpeza
  await db.run('DELETE FROM fiscal_documentos WHERE chave_acesso = ?', [chaveTeste]);

  // Inserção de documento fiscal
  await db.run(`
    INSERT INTO fiscal_documentos (
      tipo, numero, serie, chave_acesso, status, motivo_status
    ) VALUES (?, ?, ?, ?, ?, ?)
  `, ['NFE_55', 1, 1, chaveTeste, 'AUTORIZADA', 'Autorizado o uso da NF-e']);

  const doc = await db.get('SELECT * FROM fiscal_documentos WHERE chave_acesso = ?', [chaveTeste]);
  assert.ok(doc, 'Documento fiscal inserido deve ser encontrado');
  assert.strictEqual(doc.chave_acesso, chaveTeste);
  assert.strictEqual(doc.status, 'AUTORIZADA');

  // Inserção com mesma chave deve falhar
  await assert.rejects(async () => {
    await db.run(`
      INSERT INTO fiscal_documentos (
        tipo, numero, serie, chave_acesso, status
      ) VALUES (?, ?, ?, ?, ?)
    `, ['NFE_55', 2, 1, chaveTeste, 'REJEITADA']);
  }, /UNIQUE/i, 'Deve rejeitar chave_acesso fiscal duplicada');

  // Limpeza
  await db.run('DELETE FROM fiscal_documentos WHERE chave_acesso = ?', [chaveTeste]);
});
