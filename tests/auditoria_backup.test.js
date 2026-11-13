import test from 'node:test';
import assert from 'node:assert/strict';
import { mascararZeroPII, calcularDiff, serializarSeguro, registrarLog } from '../lib/audit.js';
import { query, get } from '../lib/db.js';

test('AUDITORIA TICKET 01 - Zero-PII: Mascaramento de CPF, CNPJ e Senhas', () => {
  // Teste de CPF formatado e limpo em strings
  const textoComCpf = 'Cliente portador do CPF 123.456.789-01 realizou pedido';
  const cpfMascarado = mascararZeroPII(textoComCpf);
  assert.equal(cpfMascarado.includes('123.456.789-01'), false);
  assert.ok(cpfMascarado.includes('***.456.789-**'));

  // Teste de CNPJ em strings
  const textoComCnpj = 'Emitente CNPJ 12.345.678/0001-90 autorizado';
  const cnpjMascarado = mascararZeroPII(textoComCnpj);
  assert.equal(cnpjMascarado.includes('12.345.678/0001-90'), false);
  assert.ok(cnpjMascarado.includes('**.345.678/****-**'));

  // Teste de objeto profundo com senhas e PINs
  const payloadSensivel = {
    usuario: 'GUSTAVO',
    senha: 'minha_senha_super_secreta',
    pin_seguranca: '1234',
    token_auth: 'eyJhGciOi...',
    cliente: {
      nome: 'CLIENTE TESTE',
      cpf: '000.000.001-91'
    }
  };

  const objetoLimpo = mascararZeroPII(payloadSensivel);
  assert.equal(objetoLimpo.senha, '[PROTEGIDO]');
  assert.equal(objetoLimpo.pin_seguranca, '[PROTEGIDO]');
  assert.equal(objetoLimpo.token_auth, '[PROTEGIDO]');
  assert.ok(objetoLimpo.cliente.cpf.includes('***.000.001-**'));
});

test('AUDITORIA TICKET 01 - Diff Estruturado: Detecção de propriedades modificadas', () => {
  const anterior = {
    status: 'AGUARDANDO_PAGAMENTO',
    valor_total: 100.0,
    observacoes: 'Sem observação'
  };

  const novo = {
    status: 'EM_SEPARACAO',
    valor_total: 150.0,
    observacoes: 'Sem observação'
  };

  const diff = calcularDiff(anterior, novo);
  assert.deepEqual(diff.sort(), ['status', 'valor_total'].sort());
});

test('AUDITORIA TICKET 01 - DB: registrarLog insere metadados ricos em logs_auditoria com Zero-PII', async () => {
  const dadosAnt = { preco: 100, status: 'AGUARDANDO_PAGAMENTO', cpf: '111.222.333-44' };
  const dadosNov = { preco: 120, status: 'EM_SEPARACAO', cpf: '111.222.333-44' };

  const ok = await registrarLog({
    usuarioId: 1,
    usuarioNome: 'GUSTAVO ADM',
    modulo: 'PEDIDOS',
    tipoAcao: 'STATUS_CHANGE',
    referenciaId: '#PED-TESTE-999',
    descricao: 'Mudança de status para Em Separação',
    dadosAnteriores: dadosAnt,
    dadosNovos: dadosNov,
    ip: '192.168.1.50',
    userAgent: 'ERP Test Agent'
  });

  assert.equal(ok, true);

  // Consulta registro no banco
  const reg = await get(
    'SELECT * FROM logs_auditoria WHERE referencia_id = ? ORDER BY id DESC LIMIT 1',
    ['#PED-TESTE-999']
  );

  assert.ok(reg);
  assert.equal(reg.usuario_id, 1);
  assert.equal(reg.usuario_nome, 'GUSTAVO ADM');
  assert.equal(reg.modulo, 'PEDIDOS');
  assert.equal(reg.tipo_acao, 'STATUS_CHANGE');
  assert.equal(reg.referencia_id, '#PED-TESTE-999');
  assert.equal(reg.ip_origem, '192.168.1.50');
  assert.equal(reg.campos_alterados, 'preco, status');

  // Verifica que o CPF dentro do JSON gravado foi mascarado
  assert.ok(reg.dados_anteriores.includes('***.222.333-**'));
  assert.equal(reg.dados_anteriores.includes('111.222.333-44'), false);
});
