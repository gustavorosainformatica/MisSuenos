/**
 * Módulo Central de Cálculos e Regras Matemáticas - Mis Sueños ERP
 * Compatível com Node.js ESM e navegadores modernos.
 */

export function desformatarNumeroPtBr(valor) {
  if (typeof valor === 'number') return isNaN(valor) ? 0 : valor;
  if (!valor) return 0;
  const str = String(valor).trim().replace(/[R$\s]/g, '');
  if (str.includes(',')) {
    const limpo = str.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(limpo);
    return isNaN(n) ? 0 : n;
  }
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

export function formatarMoedaPtBr(valor) {
  const num = typeof valor === 'number' ? valor : desformatarNumeroPtBr(valor);
  if (isNaN(num)) return '0,00';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function calcularSubtotalItens(itens) {
  if (!Array.isArray(itens)) return 0;
  return itens.reduce((acc, item) => {
    if (!item) return acc;
    const q = parseFloat(item.qtd) || 0;
    const p = parseFloat(item.preco) || 0;
    const sub = (item.subtotal !== undefined && item.subtotal !== null && !isNaN(item.subtotal))
      ? parseFloat(item.subtotal)
      : (q * p);
    return acc + sub;
  }, 0);
}

export function calcularTotalGeralPedido(itens, freteValor = 0) {
  const subtotalItens = calcularSubtotalItens(itens);
  const freteNum = typeof freteValor === 'number' ? freteValor : desformatarNumeroPtBr(freteValor);
  const freteSeguro = Math.max(0, isNaN(freteNum) ? 0 : freteNum);
  return Math.max(0, subtotalItens + freteSeguro);
}

export function calcularMargemProduto(precoVenda, precoCusto) {
  const venda = typeof precoVenda === 'number' ? precoVenda : desformatarNumeroPtBr(precoVenda);
  const custo = typeof precoCusto === 'number' ? precoCusto : desformatarNumeroPtBr(precoCusto);

  const margemValor = Math.max(0, venda - custo);
  let margemPercentual = 0;
  if (venda > 0) {
    margemPercentual = (margemValor / venda) * 100;
  }

  return {
    venda,
    custo,
    margemValor: Number(margemValor.toFixed(2)),
    margemPercentual: Number(margemPercentual.toFixed(1))
  };
}

export function calcularAjusteEstoque(saldoAtual, tipo, valorOuContagem) {
  const saldo = parseFloat(saldoAtual) || 0;
  const val = parseFloat(valorOuContagem) || 0;

  if (tipo === 'ENTRADA') {
    return {
      novoSaldo: saldo + val,
      diferenca: val,
      tipoOperacao: 'ENTRADA'
    };
  }

  if (tipo === 'SAIDA') {
    return {
      novoSaldo: Math.max(0, saldo - val),
      diferenca: -val,
      tipoOperacao: 'SAIDA'
    };
  }

  if (tipo === 'BALANCO') {
    const diferenca = val - saldo;
    return {
      novoSaldo: val,
      diferenca,
      tipoOperacao: diferenca >= 0 ? 'ENTRADA' : 'SAIDA'
    };
  }

  return { novoSaldo: saldo, diferenca: 0, tipoOperacao: 'NENHUMA' };
}

export function parseTextoParaItens(textoItens, valorTotal) {
  if (!textoItens || typeof textoItens !== 'string') return [];
  // Divide por ponto-e-vírgula, quebra de linha, sinal de adição ou vírgula que não seja decimal
  const partes = textoItens.split(/;|\n|\+|\,(?!\d)/).map(s => s.trim()).filter(Boolean);
  const resultado = [];

  for (const parte of partes) {
    const matchQtd = parte.match(/^(\d+(?:[.,]\d+)?)\s*(?:x|un|unid|pç|pc|peças|pecas|rolos|kg|m)?\b/i);
    const qtd = matchQtd ? parseFloat(matchQtd[1].replace(',', '.')) : 1;
    let nomeLimpo = parte.replace(/^(\d+(?:[.,]\d+)?)\s*(?:x|un|unid|pç|pc|peças|pecas|rolos|kg|m)?\s*[-–:]?\s*/i, '').trim();

    let precoExtraido = null;
    const matchPreco = nomeLimpo.match(/\((?:R\$|r\$)?\s*([\d.,]+)\)/);
    if (matchPreco) {
      precoExtraido = desformatarNumeroPtBr(matchPreco[1]);
      nomeLimpo = nomeLimpo.replace(/\((?:R\$|r\$)?\s*[\d.,]+\)/, '').trim();
    }

    const precoFinal = precoExtraido !== null ? precoExtraido : (partes.length === 1 && valorTotal ? (parseFloat(valorTotal) / qtd) : 0);
    const subtotal = qtd * precoFinal;

    resultado.push({
      id: 'item-' + Math.random().toString(36).substring(2, 9),
      nome: nomeLimpo || 'Item Diverso',
      qtd,
      preco: precoFinal,
      subtotal
    });
  }

  return resultado;
}
