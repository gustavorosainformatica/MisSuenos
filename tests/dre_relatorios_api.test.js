import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularDreAnalitico, projetarFluxoCaixa, formatarMoedaPtBr } from '../lib/calculos_erp.js';

test('INTEGRAÇÃO DRE: Cálculo analítico de período com margem bruta e líquida', () => {
  const pedidos = [
    {
      id: 1,
      numero: '#PED-1001',
      status: 'ENTREGUE',
      data_pedido: '2026-11-05',
      valor_total: 5000,
      valor_frete: 200,
      itens: JSON.stringify([
        { produto_id: 10, quantidade: 10, preco_unitario: 480, subtotal: 4800 }
      ])
    }
  ];

  const produtos = [
    { id: 10, nome: 'PELE CAPRINA EXTRA', preco_custo: 240, preco_venda: 480 }
  ];

  const financeiro = [
    {
      id: 1,
      tipo: 'PAGAR',
      categoria: 'Despesas Operacionais',
      descricao: 'Energia Elétrica e Internet',
      valor: 600,
      data_vencimento: '2026-11-10',
      status: 'PAGO'
    }
  ];

  const dre = calcularDreAnalitico(pedidos, produtos, financeiro, {
    inicio: '2026-11-01',
    fim: '2026-11-30',
    modo: 'INTEGRADO'
  });

  assert.equal(dre.receitaBruta, 5000);
  assert.equal(dre.deducoesReceita, 200); // frete
  assert.equal(dre.receitaLiquida, 4800);
  assert.equal(dre.cmvTotal, 2400); // 10 x 240
  assert.equal(dre.lucroBruto, 2400); // 4800 - 2400
  assert.equal(dre.margemBrutaPercentual, 50.0);
  assert.equal(dre.totalDespesas, 600);
  assert.equal(dre.lucroLiquido, 1800); // 2400 - 600
  assert.equal(dre.margemLiquidaPercentual, 37.5);
});

test('INTEGRAÇÃO FLUXO CAIXA: Projeção temporal de 30 dias com alerta de furo de caixa', () => {
  const pedidos = [
    {
      id: 1,
      numero: '#PED-1002',
      status: 'FATURADO',
      data_criacao: '2026-11-01',
      valor_total: 1000,
      data_vencimento: '2026-11-05'
    }
  ];

  const financeiro = [
    {
      id: 1,
      tipo: 'PAGAR',
      categoria: 'Aluguel do Barracão',
      descricao: 'Aluguel Mensal',
      valor: 2500,
      data_vencimento: '2026-11-10',
      recorrente: true,
      status: 'PENDENTE'
    }
  ];

  const fluxo = projetarFluxoCaixa(pedidos, financeiro, {
    saldoInicial: 500,
    diasProjecao: 30,
    dataBase: '2026-11-01'
  });

  assert.equal(fluxo.saldoInicial, 500);
  assert.equal(fluxo.temAlertaFuroCaixa, true);
  assert.ok(fluxo.diasNegativos > 0);
  assert.equal(fluxo.menorSaldoProjetado, -1000); // 500 + 1000 - 2500 = -1000
  assert.equal(fluxo.dataMenorSaldo, '2026-11-10');
});
