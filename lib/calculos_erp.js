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

/**
 * Calcula o próximo número comercial sugerido para pedidos (#PED-XXXX),
 * extraindo os dígitos numéricos reais de pedidos existentes para evitar colisões UNIQUE.
 */
export function calcularProximoNumeroPedido(pedidos = []) {
  let maiorNumero = 1042;
  const lista = Array.isArray(pedidos) ? pedidos : [];
  for (const p of lista) {
    if (!p) continue;
    const numStr = typeof p === 'string' ? p : (p.numero || '');
    if (numStr) {
      const match = String(numStr).match(/\d+/);
      if (match) {
        const val = parseInt(match[0], 10);
        if (!isNaN(val) && val > maiorNumero) {
          maiorNumero = val;
        }
      }
    }
  }
  return `#PED-${maiorNumero + 1}`;
}

/**
 * Calcula o DRE Analítico (Demonstrativo de Resultado do Exercício)
 * Suporta o modo 'INTEGRADO' (vendas de pedidos + CMV real + despesas do financeiro)
 * e o modo 'FINANCEIRO' (exclusivamente pelas categorias do módulo financeiro).
 * 
 * @param {Array} pedidos - Lista de pedidos do sistema
 * @param {Array} produtos - Lista de produtos (para obter preco_custo)
 * @param {Array} financeiro - Lista de lançamentos financeiros
 * @param {Object} opcoes - { inicio, fim, modo: 'INTEGRADO'|'FINANCEIRO' }
 * @returns {Object} DRE estruturado com totais e margens
 */
export function calcularDreAnalitico(pedidos = [], produtos = [], financeiro = [], opcoes = {}) {
  const modo = (opcoes.modo || 'INTEGRADO').toUpperCase();
  const dtInicio = opcoes.inicio ? String(opcoes.inicio).slice(0, 10) : null;
  const dtFim = opcoes.fim ? String(opcoes.fim).slice(0, 10) : null;

  // Função auxiliar para filtrar por período de data
  const noPeriodo = (dataStr) => {
    if (!dataStr) return true;
    const d = String(dataStr).slice(0, 10);
    if (dtInicio && d < dtInicio) return false;
    if (dtFim && d > dtFim) return false;
    return true;
  };

  // Mapa de custos de produtos por ID e por Nome normalizado
  const mapaCustosPorId = new Map();
  const mapaCustosPorNome = new Map();
  if (Array.isArray(produtos)) {
    for (const prod of produtos) {
      if (!prod) continue;
      const custo = parseFloat(prod.preco_custo) || 0;
      if (prod.id !== undefined && prod.id !== null) {
        mapaCustosPorId.set(String(prod.id), custo);
      }
      if (prod.nome) {
        mapaCustosPorNome.set(String(prod.nome).trim().toUpperCase(), custo);
      }
      if (prod.codigo_sku) {
        mapaCustosPorNome.set(String(prod.codigo_sku).trim().toUpperCase(), custo);
      }
    }
  }

  let receitaBruta = 0;
  let deducoesFrete = 0;
  let custoMercadoriasVendidas = 0;
  let contagemPedidos = 0;
  const pedidosIdsProcessados = new Set();

  if (modo === 'INTEGRADO') {
    // 1. Apuração a partir dos Pedidos de Venda
    const listaPedidos = Array.isArray(pedidos) ? pedidos : [];
    for (const ped of listaPedidos) {
      if (!ped || ped.status === 'CANCELADO') continue;
      const dataPed = ped.data_pedido || ped.data || ped.data_criacao || '';
      if (!noPeriodo(dataPed)) continue;

      contagemPedidos++;
      if (ped.id) pedidosIdsProcessados.add(String(ped.id));

      const frete = parseFloat(ped.valor_frete) || 0;
      deducoesFrete += frete;

      let subtotalItens = 0;
      let custoItensPedido = 0;

      // Extrai itens do pedido
      let itens = [];
      if (Array.isArray(ped.itensObj) && ped.itensObj.length > 0) {
        itens = ped.itensObj;
      } else if (Array.isArray(ped.itens) && ped.itens.length > 0) {
        itens = ped.itens;
      } else if (typeof ped.itens === 'string' && ped.itens.trim().startsWith('[')) {
        try {
          itens = JSON.parse(ped.itens);
        } catch {
          itens = [];
        }
      } else if (ped.itens) {
        const valTotalNum = typeof ped.valor_total === 'number' ? ped.valor_total : desformatarNumeroPtBr(ped.valor_total || ped.valor || 0);
        itens = parseTextoParaItens(ped.itens, valTotalNum);
      }

      if (itens.length > 0) {
        for (const it of itens) {
          const qtd = parseFloat(it.quantidade !== undefined ? it.quantidade : (it.qtd || 1)) || 0;
          const preco = parseFloat(it.preco_unitario !== undefined ? it.preco_unitario : (it.preco || 0)) || 0;
          const sub = it.subtotal !== undefined ? parseFloat(it.subtotal) : (qtd * preco);
          subtotalItens += sub;

          // Busca custo do produto
          let custoUnit = 0;
          if (it.produto_id && mapaCustosPorId.has(String(it.produto_id))) {
            custoUnit = mapaCustosPorId.get(String(it.produto_id));
          } else if (it.nome && mapaCustosPorNome.has(String(it.nome).trim().toUpperCase())) {
            custoUnit = mapaCustosPorNome.get(String(it.nome).trim().toUpperCase());
          } else if (it.preco_custo) {
            custoUnit = parseFloat(it.preco_custo) || 0;
          }
          custoItensPedido += (qtd * custoUnit);
        }
      } else {
        const totalPed = parseFloat(ped.valor_total || ped.valor || 0) || 0;
        subtotalItens = Math.max(0, totalPed - frete);
      }

      receitaBruta += (subtotalItens + frete);
      custoMercadoriasVendidas += custoItensPedido;
    }
  }

  // 2. Apuração a partir do Financeiro (Receitas Avulsas e Despesas Operacionais)
  const listaFin = Array.isArray(financeiro) ? financeiro : [];
  const categoriasDespesas = new Map();
  let totalDespesasOperacionais = 0;

  for (const lanc of listaFin) {
    if (!lanc || lanc.status === 'CANCELADO') continue;
    const dataLanc = lanc.data_pagamento || lanc.data_vencimento || lanc.data || '';
    if (!noPeriodo(dataLanc)) continue;

    const val = parseFloat(lanc.valor) || 0;

    // Se for receita (RECEBER)
    if (lanc.tipo === 'RECEBER') {
      if (modo === 'FINANCEIRO') {
        receitaBruta += val;
      } else if (modo === 'INTEGRADO') {
        // No modo integrado, só soma receitas financeiras avulsas que NÃO vieram de um pedido já contabilizado
        if (!lanc.pedido_id || !pedidosIdsProcessados.has(String(lanc.pedido_id))) {
          receitaBruta += val;
        }
      }
    } 
    // Se for despesa (PAGAR)
    else if (lanc.tipo === 'PAGAR') {
      const cat = (lanc.categoria || 'OUTRAS DESPESAS').trim().toUpperCase();
      const somaCat = (categoriasDespesas.get(cat) || 0) + val;
      categoriasDespesas.set(cat, somaCat);
      totalDespesasOperacionais += val;
    }
  }

  const receitaLiquida = Math.max(0, receitaBruta - deducoesFrete);
  const lucroBruto = receitaLiquida - custoMercadoriasVendidas;
  const margemBrutaPercentual = receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0;

  const lucroLiquido = lucroBruto - totalDespesasOperacionais;
  const margemLiquidaPercentual = receitaLiquida > 0 ? (lucroLiquido / receitaLiquida) * 100 : 0;
  const ticketMedio = contagemPedidos > 0 ? (receitaBruta / contagemPedidos) : 0;

  const despesasOperacionais = Array.from(categoriasDespesas.entries()).map(([categoria, total]) => ({
    categoria,
    total: Number(total.toFixed(2)),
    percentualSobreReceita: receitaLiquida > 0 ? Number(((total / receitaLiquida) * 100).toFixed(1)) : 0
  })).sort((a, b) => b.total - a.total);

  const despesasPorCategoria = {};
  for (const [cat, val] of categoriasDespesas.entries()) {
    despesasPorCategoria[cat] = Number(val.toFixed(2));
  }
  const contagemDespesasTotal = listaFin.filter(l => l && l.status !== 'CANCELADO' && l.tipo === 'PAGAR' && noPeriodo(l.data_pagamento || l.data_vencimento || l.data || '')).length;

  return {
    periodo: {
      inicio: dtInicio || 'TODOS',
      fim: dtFim || 'TODOS',
      rotulo: dtInicio && dtFim ? `${dtInicio} até ${dtFim}` : 'Período Completo'
    },
    modo,
    receitaBruta: Number(receitaBruta.toFixed(2)),
    deducoesFrete: Number(deducoesFrete.toFixed(2)),
    deducoesReceita: Number(deducoesFrete.toFixed(2)),
    receitaLiquida: Number(receitaLiquida.toFixed(2)),
    custoMercadoriasVendidas: Number(custoMercadoriasVendidas.toFixed(2)),
    cmvTotal: Number(custoMercadoriasVendidas.toFixed(2)),
    lucroBruto: Number(lucroBruto.toFixed(2)),
    margemBrutaPercentual: Number(margemBrutaPercentual.toFixed(1)),
    despesasOperacionais,
    totalDespesasOperacionais: Number(totalDespesasOperacionais.toFixed(2)),
    totalDespesas: Number(totalDespesasOperacionais.toFixed(2)),
    lucroLiquido: Number(lucroLiquido.toFixed(2)),
    margemLiquidaPercentual: Number(margemLiquidaPercentual.toFixed(1)),
    contagemPedidos,
    quantidadePedidosApurados: contagemPedidos,
    contagemDespesasTotal,
    quantidadeDespesasApuradas: contagemDespesasTotal,
    despesasPorCategoria,
    ticketMedio: Number(ticketMedio.toFixed(2))
  };
}

/**
 * Projeta o Fluxo de Caixa no tempo (dia a dia e consolidado mensal)
 * Suporta vendas à vista, parceladas e projeção automática de despesas recorrentes.
 * 
 * @param {Array} pedidos - Lista de pedidos
 * @param {Array} financeiro - Lista de lançamentos financeiros
 * @param {Object} opcoes - { saldoInicial: number, dataBase: string, diasProjecao: number, mesesProjecao: number }
 * @returns {Object} Projeção diária, consolidação mensal e alertas de caixa
 */
export function projetarFluxoCaixa(pedidos = [], financeiro = [], opcoes = {}) {
  const saldoInicialGeral = typeof opcoes.saldoInicial === 'number' ? opcoes.saldoInicial : 0;
  const diasProjecao = Math.max(1, parseInt(opcoes.diasProjecao, 10) || 30);
  const mesesProjecao = Math.max(1, parseInt(opcoes.mesesProjecao, 10) || 6);

  // Data base de partida (formato 'YYYY-MM-DD')
  let dataAtual;
  if (opcoes.dataBase && /^\d{4}-\d{2}-\d{2}$/.test(opcoes.dataBase)) {
    dataAtual = new Date(opcoes.dataBase + 'T12:00:00Z');
  } else {
    dataAtual = new Date();
  }

  const mapaDias = new Map();
  const formatarIso = (d) => d.toISOString().slice(0, 10);

  // Inicializa os dias da projeção
  for (let i = 0; i < diasProjecao; i++) {
    const d = new Date(dataAtual);
    d.setDate(d.getDate() + i);
    const iso = formatarIso(d);
    const diaNum = String(d.getDate()).padStart(2, '0');
    const mesNum = String(d.getMonth() + 1).padStart(2, '0');

    mapaDias.set(iso, {
      data: iso,
      dataFormatada: `${diaNum}/${mesNum}`,
      diaSemana: ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][d.getDay()],
      saldoInicial: 0,
      entradasPrevistas: 0,
      saidasPrevistas: 0,
      saldoDoDia: 0,
      saldoAcumulado: 0,
      isNegativo: false,
      detalhesEntradas: [],
      detalhesSaidas: []
    });
  }

  // 1. Processa Entradas de Pedidos
  const listaPedidos = Array.isArray(pedidos) ? pedidos : [];
  for (const ped of listaPedidos) {
    if (!ped || ped.status === 'CANCELADO') continue;

    // Se tiver parcelas explícitas
    if (Array.isArray(ped.parcelas) && ped.parcelas.length > 0) {
      for (const parc of ped.parcelas) {
        const dtVenc = String(parc.data_vencimento || parc.vencimento || '').slice(0, 10);
        const valParc = parseFloat(parc.valor) || 0;
        if (mapaDias.has(dtVenc) && valParc > 0) {
          const diaItem = mapaDias.get(dtVenc);
          diaItem.entradasPrevistas += valParc;
          diaItem.detalhesEntradas.push({
            origem: 'PEDIDO_PARCELADO',
            identificador: ped.numero || `#PED-${ped.id}`,
            descricao: `Venda ${ped.numero || ''} (Parc. ${parc.numero || 1}) - ${ped.cliente_nome || ped.cliente || 'Cliente'}`,
            valor: valParc
          });
        }
      }
    } else {
      // Venda à vista ou data única de vencimento
      const dtVenc = String(ped.data_vencimento || ped.data_pedido || ped.data || '').slice(0, 10);
      const valTotal = parseFloat(ped.valor_total || ped.valor || 0);
      if (mapaDias.has(dtVenc) && valTotal > 0) {
        const diaItem = mapaDias.get(dtVenc);
        diaItem.entradasPrevistas += valTotal;
        diaItem.detalhesEntradas.push({
          origem: 'PEDIDO_A_VISTA',
          identificador: ped.numero || `#PED-${ped.id}`,
          descricao: `Venda ${ped.numero || ''} - ${ped.cliente_nome || ped.cliente || 'Cliente'}`,
          valor: valTotal
        });
      }
    }
  }

  // 2. Processa Lançamentos do Financeiro
  const listaFin = Array.isArray(financeiro) ? financeiro : [];
  const despesasRecorrentesIdentificadas = [];

  for (const lanc of listaFin) {
    if (!lanc || lanc.status === 'CANCELADO') continue;

    const dtVenc = String(lanc.data_vencimento || lanc.data_pagamento || lanc.data || '').slice(0, 10);
    const val = parseFloat(lanc.valor) || 0;

    // Identifica se é despesa recorrente
    if (lanc.tipo === 'PAGAR' && (lanc.recorrente === true || lanc.recorrente === 'true' || lanc.is_recorrente)) {
      despesasRecorrentesIdentificadas.push(lanc);
    }

    if (mapaDias.has(dtVenc) && val > 0) {
      const diaItem = mapaDias.get(dtVenc);
      if (lanc.tipo === 'RECEBER') {
        diaItem.entradasPrevistas += val;
        diaItem.detalhesEntradas.push({
          origem: 'FINANCEIRO_RECEBER',
          identificador: `LAN #${lanc.id || ''}`,
          descricao: lanc.descricao || 'Receita Financeira',
          categoria: lanc.categoria || 'RECEITA',
          valor: val
        });
      } else if (lanc.tipo === 'PAGAR') {
        diaItem.saidasPrevistas += val;
        diaItem.detalhesSaidas.push({
          origem: 'FINANCEIRO_PAGAR',
          identificador: `LAN #${lanc.id || ''}`,
          descricao: lanc.descricao || 'Despesa Financeira',
          categoria: lanc.categoria || 'DESPESA',
          recorrente: !!lanc.recorrente,
          valor: val
        });
      }
    }
  }

  // 3. Projeção de Despesas Recorrentes nos meses futuros
  if (despesasRecorrentesIdentificadas.length > 0) {
    const chavesExistentes = new Set();
    // Registra o que já está lançado
    for (const d of mapaDias.values()) {
      for (const s of d.detalhesSaidas) {
        chavesExistentes.add(`${d.data}_${s.categoria}_${s.descricao}`);
      }
    }

    for (const rec of despesasRecorrentesIdentificadas) {
      const dtBaseRec = String(rec.data_vencimento || rec.data || '').slice(0, 10);
      const diaVencimento = parseInt(dtBaseRec.split('-')[2], 10) || 10;
      const valRec = parseFloat(rec.valor) || 0;

      for (let m = 1; m <= mesesProjecao; m++) {
        const dataFutura = new Date(dataAtual);
        dataFutura.setDate(1);
        dataFutura.setMonth(dataAtual.getMonth() + m);
        const diasNoMes = new Date(dataFutura.getFullYear(), dataFutura.getMonth() + 1, 0).getDate();
        const diaAjustado = Math.min(diaVencimento, diasNoMes);
        dataFutura.setDate(diaAjustado);

        const isoFutura = formatarIso(dataFutura);
        const chave = `${isoFutura}_${rec.categoria}_${rec.descricao}`;

        if (mapaDias.has(isoFutura) && !chavesExistentes.has(chave)) {
          const diaItem = mapaDias.get(isoFutura);
          diaItem.saidasPrevistas += valRec;
          diaItem.detalhesSaidas.push({
            origem: 'DESPESA_RECORRENTE_PROJETADA',
            identificador: `REC #${rec.id || ''}`,
            descricao: `🔁 [Recorrente] ${rec.descricao || rec.categoria || 'Despesa Fixa'}`,
            categoria: rec.categoria || 'DESPESA FIXA',
            recorrente: true,
            valor: valRec
          });
          chavesExistentes.add(chave);
        }
      }
    }
  }

  // 4. Calcula o Saldo Acumulado Contínuo (Dia a Dia)
  let saldoAcumuladoCorrente = saldoInicialGeral;
  let menorSaldoProjetado = saldoInicialGeral;
  let dataMenorSaldo = formatarIso(dataAtual);
  let totalEntradasPeriodo = 0;
  let totalSaidasPeriodo = 0;
  let diasNegativos = 0;

  const dias = Array.from(mapaDias.values()).map(dia => {
    dia.saldoInicial = Number(saldoAcumuladoCorrente.toFixed(2));
    dia.entradasPrevistas = Number(dia.entradasPrevistas.toFixed(2));
    dia.saidasPrevistas = Number(dia.saidasPrevistas.toFixed(2));
    dia.saldoDoDia = Number((dia.entradasPrevistas - dia.saidasPrevistas).toFixed(2));
    saldoAcumuladoCorrente += dia.saldoDoDia;
    dia.saldoAcumulado = Number(saldoAcumuladoCorrente.toFixed(2));
    dia.isNegativo = dia.saldoAcumulado < 0;

    // Aliases consumidos pelo frontend e relatórios
    dia.entradas = dia.entradasPrevistas;
    dia.saidas = dia.saidasPrevistas;
    dia.resultadoDia = dia.saldoDoDia;
    dia.dataFmt = dia.dataFormatada;

    totalEntradasPeriodo += dia.entradasPrevistas;
    totalSaidasPeriodo += dia.saidasPrevistas;

    if (dia.isNegativo) {
      diasNegativos++;
    }

    if (dia.saldoAcumulado < menorSaldoProjetado) {
      menorSaldoProjetado = dia.saldoAcumulado;
      dataMenorSaldo = dia.data;
    }

    return dia;
  });

  // 5. Consolidação Mensal (Agrupamento dos meses)
  const mapaMeses = new Map();
  for (const dia of dias) {
    const mesChave = dia.data.slice(0, 7); // 'YYYY-MM'
    if (!mapaMeses.has(mesChave)) {
      mapaMeses.set(mesChave, {
        mes: mesChave,
        rotulo: `${mesChave.split('-')[1]}/${mesChave.split('-')[0]}`,
        mesNome: `${mesChave.split('-')[1]}/${mesChave.split('-')[0]}`,
        entradas: 0,
        saidas: 0,
        resultadoOperacional: 0,
        saldoFinalMes: dia.saldoAcumulado,
        diasComSaldoNegativo: 0
      });
    }
    const mesItem = mapaMeses.get(mesChave);
    mesItem.entradas += dia.entradasPrevistas;
    mesItem.saidas += dia.saidasPrevistas;
    mesItem.resultadoOperacional = Number((mesItem.entradas - mesItem.saidas).toFixed(2));
    mesItem.saldoFinalMes = dia.saldoAcumulado;
    if (dia.isNegativo) mesItem.diasComSaldoNegativo++;
  }

  const meses = Array.from(mapaMeses.values()).map(m => ({
    ...m,
    entradas: Number(m.entradas.toFixed(2)),
    saidas: Number(m.saidas.toFixed(2)),
    resultadoOperacional: Number(m.resultadoOperacional.toFixed(2)),
    saldoFinalMes: Number(m.saldoFinalMes.toFixed(2))
  }));

  return {
    saldoInicial: Number(saldoInicialGeral.toFixed(2)),
    diasProjecao,
    totalEntradasPeriodo: Number(totalEntradasPeriodo.toFixed(2)),
    totalSaidasPeriodo: Number(totalSaidasPeriodo.toFixed(2)),
    resultadoLiquidoPeriodo: Number((totalEntradasPeriodo - totalSaidasPeriodo).toFixed(2)),
    saldoFinalPeriodo: Number(saldoAcumuladoCorrente.toFixed(2)),
    menorSaldoProjetado: Number(menorSaldoProjetado.toFixed(2)),
    dataMenorSaldo,
    diasNegativos,
    temAlertaFuroCaixa: diasNegativos > 0,
    dias,
    meses
  };
}

