import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularDreAnalitico, projetarFluxoCaixa } from '../lib/calculos_erp.js';

test('DRE TDD 01: Modo Integrado com Pedidos, CMV Real e Despesas Financeiras', () => {
  const produtos = [
    { id: 1, nome: 'Pele Caprina Especial', preco_custo: 50.00, preco_venda: 115.00 },
    { id: 2, nome: 'Passador Trançado', preco_custo: 5.00, preco_venda: 18.00 }
  ];

  const pedidos = [
    {
      id: 101,
      numero: '#PED-1001',
      data_pedido: '2026-11-05',
      status: 'ENTREGUE',
      valor_total: 145.00,
      valor_frete: 30.00,
      itensObj: [
        { produto_id: 1, nome: 'Pele Caprina Especial', quantidade: 1, preco_unitario: 115.00, subtotal: 115.00 }
      ]
    },
    {
      id: 102,
      numero: '#PED-1002',
      data_pedido: '2026-11-06',
      status: 'ENTREGUE',
      valor_total: 36.00,
      valor_frete: 0,
      itensObj: [
        { produto_id: 2, nome: 'Passador Trançado', quantidade: 2, preco_unitario: 18.00, subtotal: 36.00 }
      ]
    }
  ];

  const financeiro = [
    { id: 1, tipo: 'PAGAR', categoria: 'ALUGUEL & ENERGIA', valor: 40.00, data_pagamento: '2026-11-06', status: 'PAGO' },
    { id: 2, tipo: 'PAGAR', categoria: 'EMBALAGENS', valor: 10.00, data_pagamento: '2026-11-07', status: 'PAGO' }
  ];

  const dre = calcularDreAnalitico(pedidos, produtos, financeiro, {
    inicio: '2026-11-01',
    fim: '2026-11-30',
    modo: 'INTEGRADO'
  });

  // Receita Bruta: 145 (Ped 101) + 36 (Ped 102) = 181.00
  assert.equal(dre.receitaBruta, 181.00);
  // Frete: 30.00
  assert.equal(dre.deducoesFrete, 30.00);
  // Receita Líquida: 181 - 30 = 151.00
  assert.equal(dre.receitaLiquida, 151.00);
  // CMV: 1x 50.00 + 2x 5.00 = 60.00
  assert.equal(dre.custoMercadoriasVendidas, 60.00);
  // Lucro Bruto: 151 - 60 = 91.00
  assert.equal(dre.lucroBruto, 91.00);
  // Margem Bruta: (91 / 151) * 100 = ~60.3%
  assert.equal(dre.margemBrutaPercentual, 60.3);
  // Despesas Operacionais: 40 + 10 = 50.00
  assert.equal(dre.totalDespesasOperacionais, 50.00);
  // Lucro Líquido Real: 91 - 50 = 41.00
  assert.equal(dre.lucroLiquido, 41.00);
  // Margem Líquida: (41 / 151) * 100 = ~27.2%
  assert.equal(dre.margemLiquidaPercentual, 27.2);
  assert.equal(dre.contagemPedidos, 2);
  assert.equal(dre.ticketMedio, 90.50);
});

test('DRE TDD 02: Blindagem Anti-Duplicidade de Venda com pedido_id no Financeiro', () => {
  const produtos = [{ id: 1, nome: 'Pele Caprina', preco_custo: 50.00 }];
  const pedidos = [
    {
      id: 200,
      numero: '#PED-200',
      data_pedido: '2026-11-05',
      status: 'ENTREGUE',
      valor_total: 100.00,
      valor_frete: 0,
      itensObj: [{ produto_id: 1, quantidade: 1, preco_unitario: 100.00, subtotal: 100.00 }]
    }
  ];

  const financeiro = [
    // Título a receber derivado do pedido 200 (não pode ser somado duas vezes no modo integrado!)
    { id: 1, tipo: 'RECEBER', pedido_id: 200, valor: 100.00, data_pagamento: '2026-11-05', status: 'PAGO' },
    // Receita financeira avulsa legítima (ex: rendimento de aplicação)
    { id: 2, tipo: 'RECEBER', categoria: 'RENDIMENTO BANCÁRIO', valor: 15.00, data_pagamento: '2026-11-05', status: 'PAGO' }
  ];

  const dre = calcularDreAnalitico(pedidos, produtos, financeiro, { modo: 'INTEGRADO' });

  // Receita Bruta deve ser 100 do pedido + 15 avulsos = 115.00 (e NÃO 215.00!)
  assert.equal(dre.receitaBruta, 115.00);
});

test('DRE TDD 03: Modo Financeiro Puro (Apenas Lançamentos por Categoria)', () => {
  const financeiro = [
    { id: 1, tipo: 'RECEBER', categoria: 'VENDAS BALCÃO', valor: 500.00, data_pagamento: '2026-11-05', status: 'PAGO' },
    { id: 2, tipo: 'RECEBER', categoria: 'SERVIÇO DE MANUTENÇÃO', valor: 250.00, data_pagamento: '2026-11-06', status: 'PAGO' },
    { id: 3, tipo: 'PAGAR', categoria: 'FORNECEDOR MATÉRIA-PRIMA', valor: 300.00, data_pagamento: '2026-11-07', status: 'PAGO' },
    { id: 4, tipo: 'PAGAR', categoria: 'ALUGUEL', valor: 150.00, data_pagamento: '2026-11-08', status: 'PAGO' }
  ];

  const dre = calcularDreAnalitico([], [], financeiro, { modo: 'FINANCEIRO' });

  // Receita Bruta: 500 + 250 = 750.00
  assert.equal(dre.receitaBruta, 750.00);
  assert.equal(dre.receitaLiquida, 750.00);
  // No modo puramente financeiro, CMV é 0 e saídas são despesas operacionais
  assert.equal(dre.totalDespesasOperacionais, 450.00);
  // Lucro Líquido: 750 - 450 = 300.00
  assert.equal(dre.lucroLiquido, 300.00);
  assert.equal(dre.margemLiquidaPercentual, 40.0);
});

test('DRE TDD 04: Exclusão Segura de Pedidos e Lançamentos Cancelados', () => {
  const pedidos = [
    { id: 1, status: 'CANCELADO', valor_total: 1000.00, data_pedido: '2026-11-05' },
    { id: 2, status: 'ENTREGUE', valor_total: 200.00, valor_frete: 20.00, data_pedido: '2026-11-05' }
  ];
  const financeiro = [
    { id: 1, tipo: 'PAGAR', status: 'CANCELADO', valor: 500.00, data_pagamento: '2026-11-05' },
    { id: 2, tipo: 'PAGAR', status: 'PAGO', valor: 50.00, data_pagamento: '2026-11-05', categoria: 'LOGÍSTICA' }
  ];

  const dre = calcularDreAnalitico(pedidos, [], financeiro, { modo: 'INTEGRADO' });

  assert.equal(dre.receitaBruta, 200.00);
  assert.equal(dre.totalDespesasOperacionais, 50.00);
  assert.equal(dre.lucroLiquido, 130.00); // 200 - 20 frete - 50 despesa = 130
});

test('FLUXO CAIXA TDD 01: Projeção Diária com Saldo Acumulado e Detecção de Saldo Negativo', () => {
  const pedidos = [
    { id: 1, numero: '#PED-1', data_pedido: '2026-11-10', valor_total: 100.00 },
    { id: 2, numero: '#PED-2', data_pedido: '2026-11-12', valor_total: 250.00 }
  ];

  const financeiro = [
    // Saída no dia 11 que estoura o caixa
    { id: 1, tipo: 'PAGAR', categoria: 'FORNECEDOR', valor: 250.00, data_vencimento: '2026-11-11' }
  ];

  const proj = projetarFluxoCaixa(pedidos, financeiro, {
    saldoInicial: 50.00,
    dataBase: '2026-11-10',
    diasProjecao: 5
  });

  assert.equal(proj.saldoInicial, 50.00);
  assert.equal(proj.dias.length, 5);

  // Dia 10: Saldo Inic 50 + 100 entrada = 150.00
  const dia10 = proj.dias.find(d => d.data === '2026-11-10');
  assert.equal(dia10.saldoInicial, 50.00);
  assert.equal(dia10.entradasPrevistas, 100.00);
  assert.equal(dia10.saidasPrevistas, 0);
  assert.equal(dia10.saldoAcumulado, 150.00);
  assert.equal(dia10.isNegativo, false);

  // Dia 11: Saldo Inic 150 - 250 saída = -100.00 (Furo de caixa detectado!)
  const dia11 = proj.dias.find(d => d.data === '2026-11-11');
  assert.equal(dia11.saldoInicial, 150.00);
  assert.equal(dia11.entradasPrevistas, 0);
  assert.equal(dia11.saidasPrevistas, 250.00);
  assert.equal(dia11.saldoAcumulado, -100.00);
  assert.equal(dia11.isNegativo, true);

  // Dia 12: Saldo Inic -100 + 250 entrada = 150.00 (Recuperação do saldo positivo)
  const dia12 = proj.dias.find(d => d.data === '2026-11-12');
  assert.equal(dia12.saldoInicial, -100.00);
  assert.equal(dia12.entradasPrevistas, 250.00);
  assert.equal(dia12.saldoAcumulado, 150.00);
  assert.equal(dia12.isNegativo, false);

  assert.equal(proj.temAlertaFuroCaixa, true);
  assert.equal(proj.diasNegativos, 1);
  assert.equal(proj.menorSaldoProjetado, -100.00);
  assert.equal(proj.dataMenorSaldo, '2026-11-11');
});

test('FLUXO CAIXA TDD 02: Pedidos com Vendas Parceladas', () => {
  const pedidos = [
    {
      id: 50,
      numero: '#PED-PARC',
      valor_total: 600.00,
      parcelas: [
        { numero: 1, valor: 300.00, data_vencimento: '2026-11-10' },
        { numero: 2, valor: 300.00, data_vencimento: '2026-11-20' }
      ]
    }
  ];

  const proj = projetarFluxoCaixa(pedidos, [], {
    saldoInicial: 0,
    dataBase: '2026-11-10',
    diasProjecao: 15
  });

  const dia10 = proj.dias.find(d => d.data === '2026-11-10');
  const dia20 = proj.dias.find(d => d.data === '2026-11-20');

  assert.equal(dia10.entradasPrevistas, 300.00);
  assert.equal(dia20.entradasPrevistas, 300.00);
  assert.equal(proj.totalEntradasPeriodo, 600.00);
});

test('FLUXO CAIXA TDD 03: Projeção Automática de Despesas Recorrentes Mensais', () => {
  const financeiro = [
    {
      id: 99,
      tipo: 'PAGAR',
      categoria: 'ALUGUEL',
      descricao: 'Aluguel Galpão',
      valor: 1200.00,
      data_vencimento: '2026-11-05',
      recorrente: true
    }
  ];

  const proj = projetarFluxoCaixa([], financeiro, {
    saldoInicial: 5000.00,
    dataBase: '2026-11-01',
    diasProjecao: 45, // Cobrindo novembro e parte de dezembro
    mesesProjecao: 2
  });

  // Em dezembro (2026-12-05), deve existir a despesa recorrente de 1200 projetada automaticamente!
  const diaDez = proj.dias.find(d => d.data === '2026-12-05');
  assert.ok(diaDez, 'Dia 2026-12-05 deve estar na projeção');
  assert.equal(diaDez.saidasPrevistas, 1200.00);
  assert.equal(diaDez.detalhesSaidas[0].recorrente, true);
  assert.match(diaDez.detalhesSaidas[0].descricao, /Recorrente/);
});

