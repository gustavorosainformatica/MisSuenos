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
  let maiorNumero = 0;
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
  return `#PED-${String(maiorNumero + 1).padStart(4, '0')}`;
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

/**
 * Motor Híbrido de Resolução de Preço de Venda vs. Atacado
 * @param {Object} params
 * @param {Object} params.produto Objeto do produto com preco_venda, preco_atacado, qtd_minima_atacado
 * @param {Object} [params.cliente] Objeto do cliente com tabela_preco ('VAREJO' | 'ATACADO')
 * @param {string} [params.tabelaPedido] Tabela selecionada no pedido ('VAREJO' | 'ATACADO')
 * @param {number} [params.qtd=1] Quantidade do item no carrinho / pedido
 * @returns {Object} { precoUnitario, tabelaAplicada, fallbackUsado, subtotal, gatilho }
 */
export function resolverPrecoItem({ produto = {}, cliente = null, tabelaPedido = null, qtd = 1 } = {}) {
  const precoVenda = typeof produto.preco_venda === 'number'
    ? produto.preco_venda
    : desformatarNumeroPtBr(produto.preco_venda || 0);

  const atacadoBruto = (produto.preco_atacado !== undefined && produto.preco_atacado !== null && String(produto.preco_atacado).trim() !== '')
    ? (typeof produto.preco_atacado === 'number' ? produto.preco_atacado : desformatarNumeroPtBr(produto.preco_atacado))
    : null;
  const precoAtacado = (atacadoBruto !== null && !isNaN(atacadoBruto) && atacadoBruto > 0)
    ? atacadoBruto
    : null;

  const qtdMinimaAtacado = (produto.qtd_minima_atacado !== undefined && produto.qtd_minima_atacado !== null && !isNaN(produto.qtd_minima_atacado))
    ? Math.max(1, parseFloat(produto.qtd_minima_atacado))
    : 5.0;

  const qtdNum = Math.max(0, parseFloat(qtd) || 0);

  // Tabela efetiva do pedido: seletor explícito tem precedência; senão herda do cliente; padrão 'VAREJO'
  const modoPedido = tabelaPedido
    ? String(tabelaPedido).toUpperCase()
    : (cliente?.tabela_preco ? String(cliente.tabela_preco).toUpperCase() : 'VAREJO');

  // Elegibilidade para atacado:
  // Se o pedido está em modo ATACADO -> SIM
  // Se está em modo VAREJO -> Somente se atingir a quantidade mínima de atacado
  const elegivelAtacado = (modoPedido === 'ATACADO') || (qtdNum >= qtdMinimaAtacado);

  if (elegivelAtacado) {
    if (precoAtacado !== null) {
      return {
        precoUnitario: precoAtacado,
        tabelaAplicada: 'ATACADO',
        fallbackUsado: false,
        subtotal: Number((qtdNum * precoAtacado).toFixed(2)),
        gatilho: modoPedido === 'ATACADO' ? (tabelaPedido ? 'PEDIDO' : 'CLIENTE') : 'QUANTIDADE'
      };
    } else {
      // Produto não possui preço de atacado definido (ou é zero) -> Fallback seguro para preço de venda
      return {
        precoUnitario: precoVenda,
        tabelaAplicada: 'ATACADO_FALLBACK',
        fallbackUsado: true,
        subtotal: Number((qtdNum * precoVenda).toFixed(2)),
        gatilho: 'FALLBACK_VAREJO'
      };
    }
  }

  // Padrão: VAREJO
  return {
    precoUnitario: precoVenda,
    tabelaAplicada: 'VAREJO',
    fallbackUsado: false,
    subtotal: Number((qtdNum * precoVenda).toFixed(2)),
    gatilho: 'VAREJO'
  };
}

/**
 * Calcula o custo teórico de fabricação da Ficha Técnica (BOM)
 * Soma dos insumos consumidos + custo adicional de mão de obra/serviço
 */
export function calcularCustoProducaoBom({ itens = [], custoAdicional = 0 } = {}) {
  let custoInsumos = 0;
  if (Array.isArray(itens)) {
    for (const item of itens) {
      if (!item) continue;
      const qtd = parseFloat(item.quantidade !== undefined ? item.quantidade : (item.qtd || 0)) || 0;
      const custoUnit = parseFloat(item.preco_custo !== undefined ? item.preco_custo : (item.custo || 0)) || 0;
      custoInsumos += qtd * custoUnit;
    }
  }
  const adicional = parseFloat(custoAdicional) || 0;
  const custoTotal = custoInsumos + adicional;
  return {
    custoInsumos: Number(custoInsumos.toFixed(2)),
    custoAdicional: Number(adicional.toFixed(2)),
    custoTotal: Number(custoTotal.toFixed(2))
  };
}

/**
 * Valida se há saldo suficiente de insumos para a quantidade desejada de produção
 */
export function validarSaldoInsumos({ itensBom = [], qtdProduzir = 1, permitirSaldoNegativo = false } = {}) {
  const faltantes = [];
  const qtdNum = Math.max(0, parseFloat(qtdProduzir) || 0);

  for (const item of itensBom) {
    if (!item) continue;
    const qtdUnitaria = parseFloat(item.quantidade !== undefined ? item.quantidade : (item.qtd || 0)) || 0;
    const necessario = qtdUnitaria * qtdNum;
    const estoqueAtual = parseFloat(item.estoque_atual !== undefined ? item.estoque_atual : (item.estoque || 0)) || 0;

    if (estoqueAtual < necessario) {
      faltantes.push({
        produto_filho_id: item.produto_filho_id || item.id,
        nome: item.nome || 'Insumo',
        necessario: Number(necessario.toFixed(4)),
        disponivel: Number(estoqueAtual.toFixed(4)),
        falta: Number((necessario - estoqueAtual).toFixed(4))
      });
    }
  }

  const podeProduzir = faltantes.length === 0 || Boolean(permitirSaldoNegativo);
  return {
    podeProduzir,
    itensFaltantes: faltantes,
    saldoInsuficiente: faltantes.length > 0
  };
}

/**
 * =========================================================================
 * MOTOR MATEMÁTICO DE RASTREABILIDADE POR LOTE (BATCH TRACKING)
 * =========================================================================
 */

/**
 * Aloca o consumo de lotes utilizando o princípio PEPS / FIFO (Primeiro que Entra, Primeiro que Sai)
 * Suporta rateio entre múltiplos lotes caso um único lote não tenha saldo suficiente.
 */
export function alocarLotesPeps(lotesDisponiveis = [], quantidadeNecessaria = 0) {
  const qtdNecessaria = Math.max(0, parseFloat(quantidadeNecessaria) || 0);
  if (qtdNecessaria === 0) {
    return {
      sucesso: true,
      quantidadeAtendida: 0,
      quantidadePendente: 0,
      alocacoes: []
    };
  }

  // Clona e filtra apenas lotes ATIVOS com saldo positivo
  const lotesValidos = (Array.isArray(lotesDisponiveis) ? lotesDisponiveis : [])
    .filter(lote => lote && (lote.status === 'ATIVO' || !lote.status) && (parseFloat(lote.quantidade_atual) || 0) > 0)
    .map(lote => ({
      ...lote,
      quantidade_atual: parseFloat(lote.quantidade_atual) || 0,
      data_entrada: lote.data_entrada || '9999-99-99'
    }));

  // Ordenação estrita PEPS: data de entrada mais antiga primeiro, depois menor ID
  lotesValidos.sort((a, b) => {
    if (a.data_entrada !== b.data_entrada) {
      return a.data_entrada.localeCompare(b.data_entrada);
    }
    return (a.id || 0) - (b.id || 0);
  });

  let restante = qtdNecessaria;
  const alocacoes = [];

  for (const lote of lotesValidos) {
    if (restante <= 0) break;

    const saldoLote = lote.quantidade_atual;
    const qtdConsumir = Math.min(restante, saldoLote);
    const saldoApos = Number((saldoLote - qtdConsumir).toFixed(4));

    alocacoes.push({
      lote_id: lote.id,
      numero_lote: lote.numero_lote || '',
      quantidade: Number(qtdConsumir.toFixed(4)),
      curtume_origem: lote.curtume_origem || '',
      tonalidade: lote.tonalidade || '',
      custo_unitario: parseFloat(lote.custo_unitario) || 0,
      saldo_anterior_lote: Number(saldoLote.toFixed(4)),
      saldo_restante_lote: saldoApos
    });

    restante = Number((restante - qtdConsumir).toFixed(4));
  }

  const quantidadeAtendida = Number((qtdNecessaria - restante).toFixed(4));
  const sucesso = restante <= 0.0001;

  return {
    sucesso,
    quantidadeAtendida,
    quantidadePendente: Math.max(0, restante),
    alocacoes
  };
}

/**
 * Valida o consumo manual de lotes informados pelo operador (Override PEPS)
 */
export function validarConsumoLotes(alocacoesManuais = [], lotesBanco = []) {
  const erros = [];
  let totalConsumido = 0;

  if (!Array.isArray(alocacoesManuais) || alocacoesManuais.length === 0) {
    return { valido: false, erros: ['Nenhuma alocação de lote informada'], totalConsumido: 0 };
  }

  const mapaLotes = new Map();
  for (const lb of lotesBanco) {
    if (lb && lb.id) mapaLotes.set(lb.id, lb);
  }

  for (const item of alocacoesManuais) {
    if (!item) continue;
    const loteId = item.lote_id || item.id;
    const qtd = parseFloat(item.quantidade) || 0;

    if (qtd <= 0) {
      erros.push(`Quantidade informada para o lote deve ser maior que zero.`);
      continue;
    }

    const loteReal = mapaLotes.get(loteId);
    if (!loteReal) {
      erros.push(`Lote ID ${loteId} não encontrado no banco.`);
      continue;
    }

    if (loteReal.status && loteReal.status !== 'ATIVO') {
      erros.push(`Lote ${loteReal.numero_lote} está com status ${loteReal.status} e não permite consumo.`);
      continue;
    }

    const saldoDisponivel = parseFloat(loteReal.quantidade_atual) || 0;
    if (saldoDisponivel < qtd) {
      erros.push(`Saldo insuficiente no lote ${loteReal.numero_lote}: solicitado ${qtd}, disponível ${saldoDisponivel}.`);
      continue;
    }

    totalConsumido += qtd;
  }

  return {
    valido: erros.length === 0,
    erros,
    totalConsumido: Number(totalConsumido.toFixed(4))
  };
}

/**
 * Blindagem preventiva de numeração de lote (#LOTE-AAAA-MM-XXXX)
 * Extrai o maior número sequencial existente para evitar erro de UNIQUE constraint
 */
export function gerarNumeroLotePreventivo(registrosLotes = [], prefixo = 'LOTE', dataRef = new Date()) {
  const d = (dataRef instanceof Date && !isNaN(dataRef)) ? dataRef : new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const tagAnoMes = `${ano}-${mes}`;

  let maiorNumero = 0;
  if (Array.isArray(registrosLotes)) {
    for (const r of registrosLotes) {
      const numStr = String(r?.numero_lote || r?.numero || '');
      if (numStr.includes(tagAnoMes)) {
        const matches = numStr.match(/\d+$/);
        if (matches) {
          const num = parseInt(matches[0], 10);
          if (!isNaN(num) && num > maiorNumero) maiorNumero = num;
        }
      }
    }
  }

  const proximo = maiorNumero + 1;
  const seqStr = String(proximo).padStart(4, '0');
  return `#${prefixo.toUpperCase()}-${tagAnoMes}-${seqStr}`;
}



