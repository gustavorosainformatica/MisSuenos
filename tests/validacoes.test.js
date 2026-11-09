import test from 'node:test';
import assert from 'node:assert/strict';
import {
  limparDocumento,
  aplicarMascaraCpfCnpj,
  validarCpf,
  validarCnpj,
  validarDocumentoFiscal,
  aplicarMascaraCep,
  validarCep,
  aplicarMascaraTelefone,
  validarTelefone,
  paraCaixaAlta
} from '../lib/validacoes_erp.js';

test('VALIDAÇÃO 01: Limpar documento deve rejeitar letras, pontos, traços e espaços', () => {
  assert.equal(limparDocumento('abc123def456ghi78901'), '12345678901');
  assert.equal(limparDocumento('12.345.678/0001-90'), '12345678000190');
  assert.equal(limparDocumento('texto puro sem numero'), '');
  assert.equal(limparDocumento(''), '');
  assert.equal(limparDocumento(null), '');
});

test('VALIDAÇÃO 02: Limpar documento deve cortar no máximo em 14 dígitos (teto CNPJ)', () => {
  const excessivo = '12345678901234567890';
  assert.equal(limparDocumento(excessivo).length, 14);
  assert.equal(limparDocumento(excessivo), '12345678901234');
});

test('VALIDAÇÃO 03: Máscara dinâmica progressiva para CPF (até 11 dígitos)', () => {
  assert.equal(aplicarMascaraCpfCnpj('1'), '1');
  assert.equal(aplicarMascaraCpfCnpj('123'), '123');
  assert.equal(aplicarMascaraCpfCnpj('1234'), '123.4');
  assert.equal(aplicarMascaraCpfCnpj('123456'), '123.456');
  assert.equal(aplicarMascaraCpfCnpj('1234567'), '123.456.7');
  assert.equal(aplicarMascaraCpfCnpj('12345678901'), '123.456.789-01');
});

test('VALIDAÇÃO 04: Máscara dinâmica progressiva para CNPJ (12 a 14 dígitos)', () => {
  assert.equal(aplicarMascaraCpfCnpj('123456780001'), '12.345.678/0001');
  assert.equal(aplicarMascaraCpfCnpj('1234567800019'), '12.345.678/0001-9');
  assert.equal(aplicarMascaraCpfCnpj('12345678000195'), '12.345.678/0001-95');
});

test('VALIDAÇÃO 05: Máscara dinâmica ignora letras digitadas ou coladas', () => {
  assert.equal(aplicarMascaraCpfCnpj('ABC123DEF456GHI789JKL01'), '123.456.789-01');
  assert.equal(aplicarMascaraCpfCnpj('CNPJ: 12.345.678/0001-95 (Empresa)'), '12.345.678/0001-95');
});

test('VALIDAÇÃO 06: Validação de CPF com dígitos verificadores matemáticos', () => {
  assert.equal(validarCpf('11111111111'), false);
  assert.equal(validarCpf('00000000000'), false);
  assert.equal(validarCpf('123456789'), false);
  assert.equal(validarCpf('abc'), false);
  assert.equal(validarCpf('52998224725'), true);
  assert.equal(validarCpf('52998224726'), false);
});

test('VALIDAÇÃO 07: Validação de CNPJ com dígitos verificadores matemáticos', () => {
  assert.equal(validarCnpj('00000000000000'), false);
  assert.equal(validarCnpj('11111111111111'), false);
  assert.equal(validarCnpj('123456780001'), false);
  assert.equal(validarCnpj('00000000000191'), true);
  assert.equal(validarCnpj('00000000000192'), false);
});

test('VALIDAÇÃO 08: Validação unificada de documento fiscal', () => {
  assert.deepEqual(validarDocumentoFiscal(''), { valido: true, tipo: 'VAZIO', digitos: '' });
  assert.equal(validarDocumentoFiscal('12345').valido, false);
  assert.equal(validarDocumentoFiscal('12345').tipo, 'INCOMPLETO');

  const cpfValido = validarDocumentoFiscal('529.982.247-25');
  assert.equal(cpfValido.valido, true);
  assert.equal(cpfValido.tipo, 'CPF');

  const cnpjValido = validarDocumentoFiscal('00.000.000/0001-91');
  assert.equal(cnpjValido.valido, true);
  assert.equal(cnpjValido.tipo, 'CNPJ');
});

test('VALIDAÇÃO 09: Normalização para Caixa Alta (Uppercase)', () => {
  assert.equal(paraCaixaAlta('chico selaria'), 'CHICO SELARIA');
  assert.equal(paraCaixaAlta('   nome do cliente   '), 'NOME DO CLIENTE');
  assert.equal(paraCaixaAlta('rua das flores, 123'), 'RUA DAS FLORES, 123');
  assert.equal(paraCaixaAlta(''), '');
  assert.equal(paraCaixaAlta(null), '');
  assert.equal(paraCaixaAlta(undefined), '');
});

test('VALIDAÇÃO 10: Máscara dinâmica e bloqueio de letras para CEP (00000-000)', () => {
  assert.equal(aplicarMascaraCep('95500'), '95500');
  assert.equal(aplicarMascaraCep('95500000'), '95500-000');
  assert.equal(aplicarMascaraCep('CEP: 95500-000 RS'), '95500-000');
  assert.equal(aplicarMascaraCep('955000009999'), '95500-000'); // Corta em 8
});

test('VALIDAÇÃO 11: Validação de consistência de CEP', () => {
  assert.deepEqual(validarCep(''), { valido: true, tipo: 'VAZIO', digitos: '' });
  assert.equal(validarCep('9550').valido, false);
  assert.equal(validarCep('9550').tipo, 'INCOMPLETO');
  assert.equal(validarCep('95500-000').valido, true);
  assert.equal(validarCep('95500-000').tipo, 'CEP');
});

test('VALIDAÇÃO 12: Máscara dinâmica progressiva para Telefone (Fixo vs Celular)', () => {
  assert.equal(aplicarMascaraTelefone('51'), '(51');
  assert.equal(aplicarMascaraTelefone('513662'), '(51) 3662');
  // Fixo 10 dígitos
  assert.equal(aplicarMascaraTelefone('5136621234'), '(51) 3662-1234');
  // Celular 11 dígitos (hífen desloca automaticamente para a 5ª casa!)
  assert.equal(aplicarMascaraTelefone('51997199204'), '(51) 99719-9204');
  // Ignora letras e textos colados
  assert.equal(aplicarMascaraTelefone('Whats: (51) 99719-9204 Comercial'), '(51) 99719-9204');
});

test('VALIDAÇÃO 13: Validação de integridade de Telefone e DDD', () => {
  assert.deepEqual(validarTelefone(''), { valido: true, tipo: 'VAZIO', digitos: '' });
  // Sem DDD (menos de 10 dígitos)
  assert.equal(validarTelefone('997199204').valido, false);
  // DDD inválido começando com 0
  assert.equal(validarTelefone('05997199204').valido, false);
  // Fixo Válido (10 dígitos)
  const fixo = validarTelefone('(51) 3662-1234');
  assert.equal(fixo.valido, true);
  assert.equal(fixo.tipo, 'FIXO');
  // Celular Válido (11 dígitos começando com 9)
  const cel = validarTelefone('(51) 99719-9204');
  assert.equal(cel.valido, true);
  assert.equal(cel.tipo, 'CELULAR');
  // Celular de 11 dígitos sem o 9 no início
  const celSem9 = validarTelefone('(51) 29719-9204');
  assert.equal(celSem9.valido, false);
  assert.equal(celSem9.tipo, 'CELULAR_SEM_NONO_DIGITO');
});
