/**
 * Suíte de Testes Unitários: Espelho do Pedido, Romaneio e Resumo Comercial
 * Framework: Node.js Test Runner nativo (node:test)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gerarTextoResumoComercial,
  formatarMoedaPtBr,
  parseTextoParaItens,
  calcularTotalGeralPedido,
  calcularResumoComprasCliente
} from '../lib/calculos_erp.js';

test('TDD DOCS 01: Cenário Gustavo (1x Pele Caprina R$ 115,00 + Frete R$ 30,00 = R$ 145,00)', () => {
  const ped = {
    numero: '#PED-1044',
    cliente_nome: 'José Avelino de Oliveira',
    valor_frete: 30,
    valor_total: 145,
    itensObj: [
      { nome: 'Pele Caprina Flor Especial', quantidade: 1, preco_unitario: 115, subtotal: 115 }
    ]
  };

  const cli = {
    nome: 'José Avelino de Oliveira',
    telefone: '(51) 98765-4321'
  };

  const config = {
    nomeFantasia: 'Mis Sueños',
    chavePix: '12.345.678/0001-90',
    titularPix: 'Mis Sueños Couros',
    bancoPix: 'Banco do Brasil (001)'
  };

  const resumo = gerarTextoResumoComercial(ped, cli, config);

  assert.ok(resumo.includes('*MIS SUEÑOS*'), 'Deve conter nome da empresa em destaque');
  assert.ok(resumo.includes('#PED-1044'), 'Deve conter número do pedido');
  assert.ok(resumo.includes('José Avelino de Oliveira'), 'Deve conter o nome do cliente');
  assert.ok(resumo.includes('1x Pele Caprina Flor Especial - R$ 115,00'), 'Deve listar o item e o valor');
  assert.ok(resumo.includes('*Subtotal Produtos:* R$ 115,00'), 'Deve exibir o subtotal');
  assert.ok(resumo.includes('*Frete / Envio:* R$ 30,00'), 'Deve exibir o frete');
  assert.ok(resumo.includes('*TOTAL DO PEDIDO:* R$ 145,00'), 'Deve exibir o total geral somado');
  assert.ok(resumo.includes('Chave PIX: 12.345.678/0001-90'), 'Deve conter a chave PIX');
});

test('TDD DOCS 02: Múltiplos itens com quantidades e centavos', () => {
  const ped = {
    numero: '#PED-1045',
    cliente_nome: 'Maria Silva',
    valor_frete: 18.50,
    valor_total: 178.50,
    itensObj: [
      { nome: 'Cinto Bovino Inox', quantidade: 2, preco_unitario: 50.00, subtotal: 100.00 },
      { nome: 'Óleo para Couro 200ml', quantidade: 1, preco_unitario: 60.00, subtotal: 60.00 }
    ]
  };

  const resumo = gerarTextoResumoComercial(ped);

  assert.ok(resumo.includes('• 2x Cinto Bovino Inox - R$ 100,00'));
  assert.ok(resumo.includes('• 1x Óleo para Couro 200ml - R$ 60,00'));
  assert.ok(resumo.includes('*Subtotal Produtos:* R$ 160,00'));
  assert.ok(resumo.includes('*Frete / Envio:* R$ 18,50'));
  assert.ok(resumo.includes('*TOTAL DO PEDIDO:* R$ 178,50'));
});

test('TDD DOCS 03: Pedido com itens em formato de texto legado', () => {
  const ped = {
    numero: '#PED-1046',
    cliente_nome: 'Carlos Eduardo',
    itens: '1x Lonca de Cabrito (R$ 80,00); 2x Fivelas Inox (R$ 25,00)',
    valor_frete: 20.00,
    valor_total: 150.00
  };

  const resumo = gerarTextoResumoComercial(ped);

  assert.ok(resumo.includes('#PED-1046'));
  assert.ok(resumo.includes('Lonca de Cabrito'));
  assert.ok(resumo.includes('Fivelas Inox'));
  assert.ok(resumo.includes('*Subtotal Produtos:* R$ 130,00'));
  assert.ok(resumo.includes('*Frete / Envio:* R$ 20,00'));
  assert.ok(resumo.includes('*TOTAL DO PEDIDO:* R$ 150,00'));
});

test('TDD DOCS 04: Pedido com frete grátis / incluso', () => {
  const ped = {
    numero: '#PED-1047',
    cliente: 'Ana Beatriz',
    valor_frete: 0,
    valor_total: 250.00,
    itens: '1x Arreio Completo (R$ 250,00)'
  };

  const resumo = gerarTextoResumoComercial(ped);

  assert.ok(resumo.includes('*Frete / Envio:* Incluso / Grátis'));
  assert.ok(resumo.includes('*TOTAL DO PEDIDO:* R$ 250,00'));
});

test('TDD DOCS 05: Cliente sem nome cadastrado ou nulo assume fallback', () => {
  const ped = {
    numero: '#PED-1048',
    valor_frete: 0,
    valor_total: 90.00,
    itens: '1x Bainha de Faca (R$ 90,00)'
  };

  const resumo = gerarTextoResumoComercial(ped, null);

  assert.ok(resumo.includes('*Cliente:* Consumidor'));
  assert.ok(resumo.includes('*TOTAL DO PEDIDO:* R$ 90,00'));
});

test('TDD DOCS 06: Blindagem contra valores undefined na configuração de pagamento', () => {
  const ped = { numero: '#PED-1049', valor_total: 50 };
  const resumo = gerarTextoResumoComercial(ped, {}, {});

  assert.ok(!resumo.includes('undefined'), 'Não pode conter o texto literal undefined');
  assert.ok(!resumo.includes('null'), 'Não pode conter o texto literal null');
  assert.ok(!resumo.includes('NaN'), 'Não pode conter NaN');
});

test('TDD DOCS 07: Agrupamento e cálculo de histórico de compras por cliente', () => {
  const pedidos = [
    { numero: '#PED-1043', valor_total: 295.00, valor_frete: 30.00 },
    { numero: '#PED-1022', valor_total: 275.00, valor_frete: 25.00 },
    { numero: '#PED-0998', valor_total: 1270.00, valor_frete: 40.00 }
  ];

  const resumo = calcularResumoComprasCliente(pedidos);

  assert.equal(resumo.totalPedidos, 3, 'Deve contar exatamente 3 pedidos');
  assert.equal(resumo.totalComprado, 1840.00, 'Total comprado deve ser R$ 1.840,00');
  assert.equal(resumo.totalFrete, 95.00, 'Total de frete deve ser R$ 95,00');
  assert.equal(Math.round(resumo.ticketMedio * 100) / 100, 613.33, 'Ticket médio deve ser R$ 613,33');
});

test('TDD DOCS 08: Cliente sem pedidos acumulados retorna extrato zerado seguro sem NaN', () => {
  const resumoVazio = calcularResumoComprasCliente([]);

  assert.equal(resumoVazio.totalPedidos, 0);
  assert.equal(resumoVazio.totalComprado, 0);
  assert.equal(resumoVazio.totalFrete, 0);
  assert.equal(resumoVazio.ticketMedio, 0);

  const resumoNulo = calcularResumoComprasCliente(null);
  assert.equal(resumoNulo.totalPedidos, 0);
  assert.equal(resumoNulo.ticketMedio, 0);
});

