import test from 'node:test';
import assert from 'node:assert/strict';
import {
  limparDocumento,
  aplicarMascaraCpfCnpj,
  validarCpf,
  validarCnpj,
  validarDocumentoFiscal,
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
  // CPF com números repetidos (inválido por definição da RF)
  assert.equal(validarCpf('11111111111'), false);
  assert.equal(validarCpf('00000000000'), false);
  
  // CPF incompleto ou com letras
  assert.equal(validarCpf('123456789'), false);
  assert.equal(validarCpf('abc'), false);

  // CPF válido gerado conforme algoritmo oficial (ex: 52998224725)
  assert.equal(validarCpf('52998224725'), true);
  // CPF com dígitos finais alterados propositalmente (inválido)
  assert.equal(validarCpf('52998224726'), false);
});

test('VALIDAÇÃO 07: Validação de CNPJ com dígitos verificadores matemáticos', () => {
  // CNPJ com números repetidos (inválido)
  assert.equal(validarCnpj('00000000000000'), false);
  assert.equal(validarCnpj('11111111111111'), false);

  // CNPJ incompleto
  assert.equal(validarCnpj('123456780001'), false);

  // CNPJ válido real/conhecido (ex: Banco do Brasil 00.000.000/0001-91)
  assert.equal(validarCnpj('00000000000191'), true);
  // CNPJ com dígito final corrompido
  assert.equal(validarCnpj('00000000000192'), false);
});

test('VALIDAÇÃO 08: Validação unificada de documento fiscal', () => {
  // Vazio é aceito como opcional
  assert.deepEqual(validarDocumentoFiscal(''), { valido: true, tipo: 'VAZIO', digitos: '' });
  
  // Incompleto (ex: 5 dígitos)
  assert.equal(validarDocumentoFiscal('12345').valido, false);
  assert.equal(validarDocumentoFiscal('12345').tipo, 'INCOMPLETO');

  // CPF Válido
  const cpfValido = validarDocumentoFiscal('529.982.247-25');
  assert.equal(cpfValido.valido, true);
  assert.equal(cpfValido.tipo, 'CPF');

  // CNPJ Válido
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
