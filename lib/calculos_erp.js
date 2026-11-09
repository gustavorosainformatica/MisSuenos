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

export function gerarTextoResumoComercial(ped = {}, cli = {}, configEmpresa = {}) {
  const emp = {
    nomeFantasia: configEmpresa.nomeFantasia || 'MIS SUEÑOS',
    chavePix: configEmpresa.chavePix || '12.345.678/0001-90',
    titularPix: configEmpresa.titularPix || 'Mis Sueños Couros',
    bancoPix: configEmpresa.bancoPix || 'Banco do Brasil (001)'
  };

  const cliente = cli || {};
  let itens = [];
  if (Array.isArray(ped.itensObj) && ped.itensObj.length > 0) {
    itens = ped.itensObj;
  } else {
    const valTotalNum = typeof ped.valor_total === 'number' ? ped.valor_total : desformatarNumeroPtBr(ped.valor_total || ped.valor || 0);
    itens = parseTextoParaItens(ped.itens || '', valTotalNum);
  }

  let subtotalProdutos = itens.reduce((acc, item) => {
    const q = parseFloat(item.quantidade !== undefined ? item.quantidade : (item.qtd || 1)) || 0;
    const p = parseFloat(item.preco_unitario !== undefined ? item.preco_unitario : (item.preco || 0)) || 0;
    const sub = item.subtotal !== undefined ? parseFloat(item.subtotal) : (q * p);
    return acc + sub;
  }, 0);

  const valorFrete = typeof ped.valor_frete === 'number' ? ped.valor_frete : desformatarNumeroPtBr(ped.valor_frete || 0);
  const totalInformado = typeof ped.valor_total === 'number' ? ped.valor_total : desformatarNumeroPtBr(ped.valor_total || ped.valor || 0);

  if (subtotalProdutos === 0 && totalInformado > 0) {
    subtotalProdutos = Math.max(0, totalInformado - valorFrete);
  }
  const totalGeral = totalInformado > 0 ? totalInformado : (subtotalProdutos + valorFrete);

  const nomeDest = cliente.nome || ped.cliente_nome || ped.cliente || 'Consumidor';
  const itensTexto = itens.length > 0
    ? itens.map(it => {
        const q = it.quantidade !== undefined ? it.quantidade : (it.qtd || 1);
        const sub = it.subtotal !== undefined ? it.subtotal : (q * (it.preco_unitario || it.preco || 0));
        return `• ${q}x ${it.nome || it.descricao || 'Produto'} - R$ ${formatarMoedaPtBr(sub)}`;
      }).join('\n')
    : (ped.itens ? `• ${ped.itens}` : '• Artigos em Couro Legítimo');

  const textoFrete = valorFrete > 0
    ? `R$ ${formatarMoedaPtBr(valorFrete)}`
    : 'Incluso / Grátis';

  return `*${emp.nomeFantasia.toUpperCase()}*
*Resumo do Pedido:* ${ped.numero || '#PED-NOVO'}
*Cliente:* ${nomeDest}
----------------------------------------
*Itens:*
${itensTexto}
----------------------------------------
*Subtotal Produtos:* R$ ${formatarMoedaPtBr(subtotalProdutos)}
*Frete / Envio:* ${textoFrete}
*TOTAL DO PEDIDO:* R$ ${formatarMoedaPtBr(totalGeral)}
----------------------------------------
*Dados para Pagamento PIX:*
Chave PIX: ${emp.chavePix}
Favorecido: ${emp.titularPix}
Banco: ${emp.bancoPix}
----------------------------------------
Agradecemos pela preferência! Ficamos à disposição.`;
}

/**
 * Calcula consolidação financeira e métricas de compras do cliente
 */
export function calcularResumoComprasCliente(pedidos = []) {
  if (!Array.isArray(pedidos)) {
    return { totalPedidos: 0, totalComprado: 0, totalFrete: 0, ticketMedio: 0 };
  }
  const totalPedidos = pedidos.length;
  const totalComprado = pedidos.reduce((acc, p) => acc + (parseFloat(p?.valor_total || p?.valor) || 0), 0);
  const totalFrete = pedidos.reduce((acc, p) => acc + (parseFloat(p?.valor_frete) || 0), 0);
  const ticketMedio = totalPedidos > 0 ? (totalComprado / totalPedidos) : 0;
  return {
    totalPedidos,
    totalComprado,
    totalFrete,
    ticketMedio
  };
}
