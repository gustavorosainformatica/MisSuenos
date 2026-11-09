import test from 'node:test';
import assert from 'node:assert/strict';
import {
  desformatarNumeroPtBr,
  formatarMoedaPtBr,
  calcularSubtotalItens,
  calcularTotalGeralPedido,
  parseTextoParaItens,
  calcularProximoNumeroPedido
} from '../lib/calculos_erp.js';

test('REGRESSÃO PEDIDOS 01: Cenário Gustavo (1x Pele Caprina R$ 115,00 + Frete R$ 30,00 = R$ 145,00)', () => {
  const itens = [
    { id: '1', nome: 'Pele Caprina', qtd: 1, preco: 115 }
  ];
  const frete = 30;

  const subtotal = calcularSubtotalItens(itens);
  assert.strictEqual(subtotal, 115, 'Subtotal dos produtos deve ser 115,00');

  const totalGeral = calcularTotalGeralPedido(itens, frete);
  assert.strictEqual(totalGeral, 145, 'Total geral DEVE somar 115 + 30 = 145,00');
  assert.notStrictEqual(totalGeral, 30, 'Falha de regressão: Total Geral foi sobrescrito pelo frete!');
  assert.notStrictEqual(totalGeral, 115, 'Falha de regressão: Frete foi ignorado!');
});

test('REGRESSÃO PEDIDOS 02: Adição de novo item com frete já preenchido', () => {
  // Estado inicial: 1 item de R$ 115,00 + frete R$ 30,00 = R$ 145,00
  let itens = [{ id: '1', nome: 'Pele Caprina', qtd: 1, preco: 115 }];
  let frete = 30;
  assert.strictEqual(calcularTotalGeralPedido(itens, frete), 145);

  // Adiciona segundo item: 1x Carteira de Couro @ R$ 50,00
  itens.push({ id: '2', nome: 'Carteira de Couro', qtd: 1, preco: 50 });
  
  const subtotal = calcularSubtotalItens(itens);
  assert.strictEqual(subtotal, 165, 'Novo subtotal deve ser 115 + 50 = 165,00');

  const novoTotalGeral = calcularTotalGeralPedido(itens, frete);
  assert.strictEqual(novoTotalGeral, 195, 'Novo total geral deve ser 165 + 30 frete = 195,00');
});

test('REGRESSÃO PEDIDOS 03: Alteração do valor do frete com produtos já lançados', () => {
  const itens = [{ id: '1', nome: 'Pele Caprina', qtd: 1, preco: 115 }];

  // Frete inicial: R$ 30,00 -> Total R$ 145,00
  assert.strictEqual(calcularTotalGeralPedido(itens, 30), 145);

  // Altera frete para R$ 45,00 -> Total R$ 160,00
  assert.strictEqual(calcularTotalGeralPedido(itens, 45), 160);

  // Altera frete em formato texto brasileiro "R$ 60,00" -> Total R$ 175,00
  assert.strictEqual(calcularTotalGeralPedido(itens, 'R$ 60,00'), 175);
});

test('REGRESSÃO PEDIDOS 04: Zerar ou limpar o frete não pode apagar o subtotal de produtos', () => {
  const itens = [{ id: '1', nome: 'Pele Caprina', qtd: 1, preco: 115 }];

  assert.strictEqual(calcularTotalGeralPedido(itens, 0), 115);
  assert.strictEqual(calcularTotalGeralPedido(itens, '0,00'), 115);
  assert.strictEqual(calcularTotalGeralPedido(itens, ''), 115);
  assert.strictEqual(calcularTotalGeralPedido(itens, null), 115);
});

test('REGRESSÃO PEDIDOS 05: Alteração de quantidade de item (+ e -)', () => {
  const itens = [{ id: '1', nome: 'Pele Caprina', qtd: 1, preco: 115 }];
  const frete = 30;

  // Qtd 1 -> 115 + 30 = 145
  assert.strictEqual(calcularTotalGeralPedido(itens, frete), 145);

  // Altera qtd para 3 -> (3 * 115) + 30 = 345 + 30 = 375
  itens[0].qtd = 3;
  itens[0].subtotal = itens[0].qtd * itens[0].preco;
  assert.strictEqual(calcularSubtotalItens(itens), 345);
  assert.strictEqual(calcularTotalGeralPedido(itens, frete), 375);

  // Altera qtd para 2 -> (2 * 115) + 30 = 230 + 30 = 260
  itens[0].qtd = 2;
  itens[0].subtotal = itens[0].qtd * itens[0].preco;
  assert.strictEqual(calcularSubtotalItens(itens), 230);
  assert.strictEqual(calcularTotalGeralPedido(itens, frete), 260);
});

test('REGRESSÃO PEDIDOS 06: Alteração do preço unitário de um item', () => {
  const itens = [{ id: '1', nome: 'Pele Caprina Especial', qtd: 1, preco: 115 }];
  const frete = 30;

  // Altera preço unitário negociado para R$ 130,00
  itens[0].preco = 130;
  itens[0].subtotal = itens[0].qtd * itens[0].preco;

  assert.strictEqual(calcularSubtotalItens(itens), 130);
  assert.strictEqual(calcularTotalGeralPedido(itens, frete), 160);
});

test('REGRESSÃO PEDIDOS 07: Exclusão de item do pedido com recalculo imediato', () => {
  let itens = [
    { id: '1', nome: 'Pele Caprina', qtd: 1, preco: 115 },
    { id: '2', nome: 'Sola de Couro', qtd: 2, preco: 40 } // 80.00
  ];
  const frete = 20;

  // Total inicial: 115 + 80 + 20 = 215
  assert.strictEqual(calcularTotalGeralPedido(itens, frete), 215);

  // Remove o item 2 (Sola de Couro)
  itens.splice(1, 1);

  assert.strictEqual(calcularSubtotalItens(itens), 115);
  assert.strictEqual(calcularTotalGeralPedido(itens, frete), 135);

  // Remove o item 1 (fica sem itens)
  itens.splice(0, 1);
  assert.strictEqual(calcularSubtotalItens(itens), 0);
  assert.strictEqual(calcularTotalGeralPedido(itens, frete), 20);
});

test('REGRESSÃO PEDIDOS 08: Precisão decimal com centavos reais em produtos e frete', () => {
  const itens = [
    { id: '1', nome: 'Retalho Nobre', qtd: 2.5, preco: 33.30 }, // 83.25
    { id: '2', nome: 'Fivela Ouro Velho', qtd: 4, preco: 7.45 }  // 29.80
  ];
  const frete = '14,75'; // 14.75

  const subtotal = calcularSubtotalItens(itens);
  assert.strictEqual(Number(subtotal.toFixed(2)), 113.05);

  const totalGeral = calcularTotalGeralPedido(itens, frete);
  assert.strictEqual(Number(totalGeral.toFixed(2)), 127.80);
});

test('REGRESSÃO PEDIDOS 09: Ciclo completo de serialização e recuperação (Round-Trip)', () => {
  const itensOriginais = [
    { id: '1', nome: 'Pele Caprina Nobre', qtd: 1, preco: 115 },
    { id: '2', nome: 'Cinto Fivela Inox', qtd: 2, preco: 85.50 }
  ];
  const frete = 30;

  // Formata para o texto legado salvo no banco
  const textoSerializado = itensOriginais.map(i => `${i.qtd}x ${i.nome} (R$ ${formatarMoedaPtBr(i.preco)})`).join(', ');
  assert.strictEqual(textoSerializado, '1x Pele Caprina Nobre (R$ 115,00), 2x Cinto Fivela Inox (R$ 85,50)');

  // Reconstrói a lista a partir do texto
  const itensRecuperados = parseTextoParaItens(textoSerializado);
  assert.strictEqual(itensRecuperados.length, 2, 'Deve reconstruir exatamente 2 itens');
  
  assert.strictEqual(itensRecuperados[0].nome, 'Pele Caprina Nobre');
  assert.strictEqual(itensRecuperados[0].qtd, 1);
  assert.strictEqual(itensRecuperados[0].preco, 115);

  assert.strictEqual(itensRecuperados[1].nome, 'Cinto Fivela Inox');
  assert.strictEqual(itensRecuperados[1].qtd, 2);
  assert.strictEqual(itensRecuperados[1].preco, 85.50);

  // Valida que o total calculado a partir da recuperação continua idêntico
  const subtotalRecuperado = calcularSubtotalItens(itensRecuperados);
  assert.strictEqual(subtotalRecuperado, 286.00);

  const totalRecuperado = calcularTotalGeralPedido(itensRecuperados, frete);
  assert.strictEqual(totalRecuperado, 316.00);
});

test('REGRESSÃO PEDIDOS 10: Geração do Próximo Número de Pedido sem colisão UNIQUE', () => {
  // 1. Lista vazia ou sem pedidos: fallback para #PED-1043
  assert.strictEqual(calcularProximoNumeroPedido([]), '#PED-1043');
  assert.strictEqual(calcularProximoNumeroPedido(null), '#PED-1043');

  // 2. Cenário Real do Bug Gustavo: Pedido no banco com id: 9 e numero: '#PED-1043'
  // Antes calculava em cima de id: 9 gerando #PED-1043 e colidindo no banco
  const pedidosExistentes = [
    { id: 1, numero: '#PED-1035' },
    { id: 2, numero: '#PED-1038' },
    { id: 9, numero: '#PED-1043' }
  ];
  assert.strictEqual(
    calcularProximoNumeroPedido(pedidosExistentes),
    '#PED-1044',
    'Deve extrair 1043 do campo numero e sugerir #PED-1044 mesmo com id: 9'
  );

  // 3. Suporte a pedidos fora de ordem e formatos mistos
  const pedidosMisturados = [
    { id: 99, numero: '#PED-1050' },
    { id: 1, numero: 'PED-1042' },
    { id: 12, numero: '#PED-1049' }
  ];
  assert.strictEqual(calcularProximoNumeroPedido(pedidosMisturados), '#PED-1051');

  // 4. Suporte a lista com strings diretas (ex: retorno simples do banco)
  const stringsDiretas = ['#PED-1043', '#PED-1044'];
  assert.strictEqual(calcularProximoNumeroPedido(stringsDiretas), '#PED-1045');
});


