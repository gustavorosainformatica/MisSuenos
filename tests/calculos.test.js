import test from 'node:test';
import assert from 'node:assert/strict';
import {
  desformatarNumeroPtBr,
  formatarMoedaPtBr,
  calcularSubtotalItens,
  calcularTotalGeralPedido,
  calcularMargemProduto,
  calcularAjusteEstoque,
  parseTextoParaItens
} from '../lib/calculos_erp.js';

test('1. Caso Clássico Gustavo: Pele Caprina (R$ 115,00) + Frete (R$ 30,00) deve somar R$ 145,00', () => {
  const itens = [
    { nome: 'Pele Caprina', qtd: 1, preco: 115 }
  ];
  const frete = 30;

  const subtotal = calcularSubtotalItens(itens);
  assert.strictEqual(subtotal, 115, 'O subtotal de 1 pele caprina a 115 deve ser 115');

  const totalGeral = calcularTotalGeralPedido(itens, frete);
  assert.strictEqual(totalGeral, 145, 'O total geral (115 itens + 30 frete) DEVE ser 145');
  assert.notStrictEqual(totalGeral, 30, 'O total NÃO pode ser apenas o frete de 30');
  assert.notStrictEqual(totalGeral, 115, 'O total NÃO pode ignorar o frete de 30');
});

test('2. Múltiplos itens com quantidades fracionadas e centavos', () => {
  const itens = [
    { nome: 'Couro Bovino Flor', qtd: 2, preco: 110.50 }, // 221.00
    { nome: 'Tira de Acabamento', qtd: 3, preco: 45.25 }   // 135.75
  ];
  const frete = '25,00'; // Testando formato string pt-BR

  const subtotal = calcularSubtotalItens(itens);
  assert.strictEqual(subtotal, 356.75, 'Subtotal correto com decimais');

  const totalGeral = calcularTotalGeralPedido(itens, frete);
  assert.strictEqual(totalGeral, 381.75, 'Total geral somando decimais e frete pt-BR');
});

test('3. Pedido com itens mas frete zero ou não informado', () => {
  const itens = [
    { nome: 'Tapete de Couro', qtd: 1, preco: 250 }
  ];

  assert.strictEqual(calcularTotalGeralPedido(itens, 0), 250);
  assert.strictEqual(calcularTotalGeralPedido(itens, '0,00'), 250);
  assert.strictEqual(calcularTotalGeralPedido(itens, null), 250);
  assert.strictEqual(calcularTotalGeralPedido(itens, undefined), 250);
});

test('4. Pedido sem itens (lista vazia) mas com frete cadastrado', () => {
  const itens = [];
  const frete = 40;

  assert.strictEqual(calcularSubtotalItens(itens), 0);
  assert.strictEqual(calcularTotalGeralPedido(itens, frete), 40);
});

test('5. Formatação e Desformatação de Moeda Brasileira (R$)', () => {
  assert.strictEqual(desformatarNumeroPtBr('115,00'), 115);
  assert.strictEqual(desformatarNumeroPtBr('1.250,75'), 1250.75);
  assert.strictEqual(desformatarNumeroPtBr('R$ 30,00'), 30);
  assert.strictEqual(desformatarNumeroPtBr(115), 115);
  assert.strictEqual(desformatarNumeroPtBr(''), 0);
  assert.strictEqual(desformatarNumeroPtBr(null), 0);

  assert.strictEqual(formatarMoedaPtBr(145), '145,00');
  assert.strictEqual(formatarMoedaPtBr(1250.5), '1.250,50');
  assert.strictEqual(formatarMoedaPtBr(0), '0,00');
});

test('6. Cálculo de Margem Bruta de Produto (R$ e %)', () => {
  // Preço Venda: 100, Custo: 60 -> Margem: R$ 40 (40%)
  const m1 = calcularMargemProduto(100, 60);
  assert.strictEqual(m1.margemValor, 40);
  assert.strictEqual(m1.margemPercentual, 40.0);

  // Preço Venda: 150, Custo: 150 -> Margem: 0 (0%)
  const m2 = calcularMargemProduto(150, 150);
  assert.strictEqual(m2.margemValor, 0);
  assert.strictEqual(m2.margemPercentual, 0);

  // Preço Venda: 80, Custo: 0 -> Margem: 100%
  const m3 = calcularMargemProduto(80, 0);
  assert.strictEqual(m3.margemValor, 80);
  assert.strictEqual(m3.margemPercentual, 100);
});

test('7. Ajuste Rápido de Estoque (Entrada, Saída e Balanço)', () => {
  // Entrada simples
  const e1 = calcularAjusteEstoque(10, 'ENTRADA', 5);
  assert.strictEqual(e1.novoSaldo, 15);
  assert.strictEqual(e1.diferenca, 5);

  // Saída simples
  const s1 = calcularAjusteEstoque(10, 'SAIDA', 4);
  assert.strictEqual(s1.novoSaldo, 6);
  assert.strictEqual(s1.diferenca, -4);

  // Balanço físico superior (contagem real = 14) -> deve virar Entrada de +4
  const b1 = calcularAjusteEstoque(10, 'BALANCO', 14);
  assert.strictEqual(b1.novoSaldo, 14);
  assert.strictEqual(b1.diferenca, 4);
  assert.strictEqual(b1.tipoOperacao, 'ENTRADA');

  // Balanço físico inferior (contagem real = 7) -> deve virar Saída de -3
  const b2 = calcularAjusteEstoque(10, 'BALANCO', 7);
  assert.strictEqual(b2.novoSaldo, 7);
  assert.strictEqual(b2.diferenca, -3);
  assert.strictEqual(b2.tipoOperacao, 'SAIDA');
});

test('8. Parser de Itens Legados em Texto', () => {
  const texto = '1x Pele Caprina (R$ 115,00), 2x Couro Bovino (R$ 90,00)';
  const itens = parseTextoParaItens(texto);

  assert.strictEqual(itens.length, 2, 'Deve extrair exatamente 2 itens');
  assert.strictEqual(itens[0].nome, 'Pele Caprina');
  assert.strictEqual(itens[0].qtd, 1);
  assert.strictEqual(itens[0].preco, 115);
  assert.strictEqual(itens[0].subtotal, 115);

  assert.strictEqual(itens[1].nome, 'Couro Bovino');
  assert.strictEqual(itens[1].qtd, 2);
  assert.strictEqual(itens[1].preco, 90);
  assert.strictEqual(itens[1].subtotal, 180);
});

