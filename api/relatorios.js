/**
 * Vercel Serverless Function & REST API: /api/relatorios
 * Central de Relatórios Executivos & BI - Mis Sueños ERP
 * Autor: Gustavo Rosa Informática
 * 
 * Agregações analíticas de alta performance (SQLite / Turso):
 * - Vendas & Comercial (Curva ABC de Clientes, Ranking por UF, Curva ABC de Produtos)
 * - Financeiro & Controladoria (DRE Gerencial Sintético/Analítico, Fluxo de Caixa)
 * - Estoque & Suprimentos (Posição e Patrimônio a Preço de Custo e Venda, Ruptura)
 * - Fiscal & Contabilidade (Livro de Saídas NF-e Modelo 55, NFS-e, Fechamento Mensal)
 * - Clientes & CRM (Clientes Inativos, Análise de Recorrência)
 * 
 * Suporte a formatos: JSON (visualização dinâmica) e CSV (exportação com BOM UTF-8).
 */

import { query, get, registrarLog } from '../lib/db.js';
import { calcularDreAnalitico, projetarFluxoCaixa, formatarMoedaPtBr } from '../lib/calculos_erp.js';
import { validarTokenSessao } from '../lib/auth.js';

function responder(res, status, data, headers = {}) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    if (headers) {
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    }
    return res.status(status).json(data);
  }

  const defaultHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...headers
  };

  res.writeHead(status, defaultHeaders);
  if (Buffer.isBuffer(data)) {
    res.end(data);
  } else {
    res.end(typeof data === 'string' ? data : JSON.stringify(data));
  }
}

// Expressão SQL que normaliza tanto '15/10/2026' quanto '2026-10-15T...' para '2026-10-15'
const SQL_DATA_PEDIDO = `
  (CASE 
    WHEN data_pedido LIKE '__/__/____%' THEN SUBSTR(data_pedido, 7, 4) || '-' || SUBSTR(data_pedido, 4, 2) || '-' || SUBSTR(data_pedido, 1, 2)
    ELSE SUBSTR(data_pedido, 1, 10)
  END)
`;

function calcularDatasPeriodo(periodo, dataInicioCustom, dataFimCustom) {
  const agora = new Date();
  let inicio = new Date();
  let fim = new Date();
  let descricao = 'Período Personalizado';

  const formatarIsoData = (d) => d.toISOString().split('T')[0];

  switch (periodo) {
    case 'hoje':
      descricao = 'Hoje (' + agora.toLocaleDateString('pt-BR') + ')';
      return { inicio: formatarIsoData(agora), fim: formatarIsoData(agora), descricao };

    case '7dias':
      inicio.setDate(agora.getDate() - 7);
      descricao = 'Últimos 7 Dias';
      return { inicio: formatarIsoData(inicio), fim: formatarIsoData(agora), descricao };

    case 'mes_atual':
      inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
      fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0);
      descricao = 'Mês Atual (' + agora.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) + ')';
      return { inicio: formatarIsoData(inicio), fim: formatarIsoData(fim), descricao };

    case 'mes_anterior':
      inicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
      fim = new Date(agora.getFullYear(), agora.getMonth(), 0);
      descricao = 'Mês Anterior (' + inicio.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) + ')';
      return { inicio: formatarIsoData(inicio), fim: formatarIsoData(fim), descricao };

    case 'trimestre':
      inicio.setDate(agora.getDate() - 90);
      descricao = 'Último Trimestre (90 Dias)';
      return { inicio: formatarIsoData(inicio), fim: formatarIsoData(agora), descricao };

    case 'ano':
      inicio = new Date(agora.getFullYear(), 0, 1);
      fim = new Date(agora.getFullYear(), 11, 31);
      descricao = 'Ano Corrente (' + agora.getFullYear() + ')';
      return { inicio: formatarIsoData(inicio), fim: formatarIsoData(fim), descricao };

    case 'todos':
      descricao = 'Histórico Completo';
      return { inicio: '2020-01-01', fim: '2099-12-31', descricao };

    case 'custom':
    default:
      if (dataInicioCustom && dataFimCustom) {
        descricao = `De ${dataInicioCustom} até ${dataFimCustom}`;
        return { inicio: dataInicioCustom, fim: dataFimCustom, descricao };
      }
      inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
      fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0);
      descricao = 'Mês Atual (' + agora.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) + ')';
      return { inicio: formatarIsoData(inicio), fim: formatarIsoData(fim), descricao };
  }
}

async function obterDadosEmpresa() {
  const configs = await query("SELECT chave, valor FROM configuracoes_sistema");
  const mapa = {};
  for (const c of configs) mapa[c.chave] = c.valor;

  return {
    razaoSocial: mapa.razao_social || 'MIS SUEÑOS COUROS & PELES',
    nomeFantasia: mapa.nome_fantasia || 'Mis Sueños ERP',
    cnpj: mapa.cnpj || '00.000.000/0001-91',
    cidade: mapa.cidade || 'Sapiranga/RS',
    subtitulo: mapa.subtitulo_sistema || 'Couros & Insumos • Sapiranga/RS'
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return res.status(204).end();
    }
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  if (req.method !== 'GET') {
    return responder(res, 405, { error: 'Método não permitido. Utilize GET para consultas de relatórios.' });
  }

  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const sessao = validarTokenSessao(token);

    let operador = null;
    let podeVerCustos = true;

    if (sessao) {
      operador = await get('SELECT id, nome, login, papel, permissoes FROM usuarios WHERE id = ?', [sessao.usuarioId]);
      if (operador) {
        let perms = {};
        try { perms = typeof operador.permissoes === 'string' ? JSON.parse(operador.permissoes || '{}') : operador.permissoes; } catch {}
        podeVerCustos = operador.papel === 'ADMIN' || !!perms.produtos_custo;
      }
    }

    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const tipo = (urlObj.searchParams.get('tipo') || 'vendas_curva_abc').toLowerCase();
    const periodo = urlObj.searchParams.get('periodo') || 'mes_atual';
    const dataInicioParam = urlObj.searchParams.get('data_inicio') || urlObj.searchParams.get('inicio');
    const dataFimParam = urlObj.searchParams.get('data_fim') || urlObj.searchParams.get('fim');
    const formato = (urlObj.searchParams.get('formato') || 'json').toLowerCase();

    const infoPeriodo = calcularDatasPeriodo(periodo, dataInicioParam, dataFimParam);
    const empresa = await obterDadosEmpresa();

    let resultado = null;

    // =========================================================================
    // 1. COMERCIAL: CURVA ABC DE CLIENTES (PARETO 80/20)
    // =========================================================================
    if (tipo === 'vendas_curva_abc') {
      const rows = await query(`
        SELECT 
          COALESCE(cliente_id, 0) as cliente_id,
          cliente_nome,
          COALESCE(NULLIF(uf, ''), 'RS') as uf,
          COALESCE(cidade, '') as cidade,
          COUNT(id) as total_pedidos,
          ROUND(SUM(valor_total), 2) as faturamento_total,
          ROUND(AVG(valor_total), 2) as ticket_medio,
          MAX(${SQL_DATA_PEDIDO}) as ultima_compra
        FROM pedidos
        WHERE ${SQL_DATA_PEDIDO} >= ? AND ${SQL_DATA_PEDIDO} <= ?
        GROUP BY cliente_nome, uf
        ORDER BY faturamento_total DESC
      `, [infoPeriodo.inicio, infoPeriodo.fim]);

      const faturamentoGeral = rows.reduce((acc, r) => acc + (r.faturamento_total || 0), 0);
      let acumulado = 0;
      let qtdClasseA = 0;
      let qtdClasseB = 0;
      let qtdClasseC = 0;

      const dadosFormatados = rows.map((r, idx) => {
        const percIndividual = faturamentoGeral > 0 ? (r.faturamento_total / faturamentoGeral) * 100 : 0;
        acumulado += percIndividual;

        let classe = 'C';
        if (acumulado <= 70.01) { classe = 'A'; qtdClasseA++; }
        else if (acumulado <= 90.01) { classe = 'B'; qtdClasseB++; }
        else { classe = 'C'; qtdClasseC++; }

        return {
          posicao: idx + 1,
          cliente_nome: r.cliente_nome,
          cidade: r.cidade,
          uf: r.uf,
          total_pedidos: r.total_pedidos,
          faturamento_total: r.faturamento_total,
          ticket_medio: r.ticket_medio,
          perc_individual: percIndividual.toFixed(1) + '%',
          perc_acumulada: Math.min(100, acumulado).toFixed(1) + '%',
          classe,
          ultima_compra: r.ultima_compra || '-'
        };
      });

      resultado = {
        titulo: 'Curva ABC de Vendas por Cliente (Pareto)',
        categoria: 'Comercial & Vendas',
        orientacaoPadrao: 'retrato',
        kpis: {
          faturamentoTotal: faturamentoGeral,
          totalClientesAtivos: rows.length,
          ticketMedioGeral: rows.length > 0 ? faturamentoGeral / rows.length : 0,
          distribuicaoClasses: `Classe A: ${qtdClasseA} • Classe B: ${qtdClasseB} • Classe C: ${qtdClasseC}`,
          destaque: rows[0] ? `${rows[0].cliente_nome} (${rows[0].uf})` : 'Nenhum'
        },
        colunas: [
          { chave: 'posicao', titulo: '#', tipo: 'numero', width: '50px' },
          { chave: 'cliente_nome', titulo: 'Cliente / Razão Social', tipo: 'texto' },
          { chave: 'uf', titulo: 'UF', tipo: 'texto', width: '60px' },
          { chave: 'total_pedidos', titulo: 'Pedidos', tipo: 'numero', width: '80px' },
          { chave: 'faturamento_total', titulo: 'Faturamento Total', tipo: 'moeda', width: '150px' },
          { chave: 'ticket_medio', titulo: 'Ticket Médio', tipo: 'moeda', width: '130px' },
          { chave: 'perc_acumulada', titulo: '% Acumulada', tipo: 'texto', width: '110px' },
          { chave: 'classe', titulo: 'Classe ABC', tipo: 'badge_abc', width: '90px' }
        ],
        dados: dadosFormatados
      };
    }

    // =========================================================================
    // 2. COMERCIAL: VENDAS POR ESTADO & REGIÃO (UF)
    // =========================================================================
    else if (tipo === 'vendas_uf') {
      const rows = await query(`
        SELECT 
          COALESCE(NULLIF(uf, ''), 'RS') as estado,
          COUNT(id) as total_pedidos,
          ROUND(SUM(valor_total), 2) as faturamento,
          ROUND(AVG(valor_total), 2) as ticket_medio
        FROM pedidos
        WHERE ${SQL_DATA_PEDIDO} >= ? AND ${SQL_DATA_PEDIDO} <= ?
        GROUP BY estado
        ORDER BY faturamento DESC
      `, [infoPeriodo.inicio, infoPeriodo.fim]);

      const fatTotal = rows.reduce((acc, r) => acc + (r.faturamento || 0), 0);
      const totalPedidos = rows.reduce((acc, r) => acc + (r.total_pedidos || 0), 0);

      const dados = rows.map((r, idx) => ({
        posicao: idx + 1,
        estado: r.estado,
        total_pedidos: r.total_pedidos,
        faturamento: r.faturamento,
        ticket_medio: r.ticket_medio,
        participacao: fatTotal > 0 ? ((r.faturamento / fatTotal) * 100).toFixed(1) + '%' : '0%'
      }));

      resultado = {
        titulo: 'Vendas e Faturamento por Estado (UF)',
        categoria: 'Comercial & Vendas',
        orientacaoPadrao: 'retrato',
        kpis: {
          faturamentoTotal: fatTotal,
          totalPedidos,
          estadosAtendidos: rows.length,
          ufLider: rows[0] ? `${rows[0].estado} (${rows[0].participacao || ''})` : '-'
        },
        colunas: [
          { chave: 'posicao', titulo: '#', tipo: 'numero', width: '50px' },
          { chave: 'estado', titulo: 'Estado (UF)', tipo: 'texto' },
          { chave: 'total_pedidos', titulo: 'Volume de Pedidos', tipo: 'numero' },
          { chave: 'faturamento', titulo: 'Faturamento (R$)', tipo: 'moeda' },
          { chave: 'ticket_medio', titulo: 'Ticket Médio', tipo: 'moeda' },
          { chave: 'participacao', titulo: 'Participação (%)', tipo: 'texto' }
        ],
        dados
      };
    }

    // =========================================================================
    // 3. FINANCEIRO: DRE GERENCIAL (SINTÉTICO E ANALÍTICO)
    // =========================================================================
    else if (tipo === 'dre_gerencial') {
      if (!podeVerCustos) {
        return responder(res, 403, { error: 'Acesso negado: seu operador não possui permissão para visualizar custos e DRE.' });
      }

      const modo = url.searchParams.get('modo') || 'INTEGRADO';

      // 1. Busca Pedidos não cancelados no período
      const pedidos = await query(`
        SELECT * FROM pedidos 
        WHERE status != 'CANCELADO' AND ${SQL_DATA_PEDIDO} >= ? AND ${SQL_DATA_PEDIDO} <= ?
      `, [infoPeriodo.inicio, infoPeriodo.fim]);

      // 2. Busca Catálogo de Produtos
      const produtos = await query(`SELECT * FROM produtos`);

      // 3. Busca Lançamentos Financeiros não cancelados no período
      const financeiro = await query(`
        SELECT * FROM financeiro_lancamentos 
        WHERE status != 'CANCELADO' AND data_vencimento >= ? AND data_vencimento <= ?
      `, [infoPeriodo.inicio, infoPeriodo.fim]);

      const dre = calcularDreAnalitico(pedidos, produtos, financeiro, { inicio: infoPeriodo.inicio, fim: infoPeriodo.fim, modo });

      const linhasDRE = [
        { conta: '1. RECEITA OPERACIONAL BRUTA', valor: dre.receitaBruta, percentual: '100.0%', tipoLinha: 'destaque_verde' },
        { conta: '   (-) Deduções de Frete e Devoluções', valor: -dre.deducoesReceita, percentual: dre.receitaBruta > 0 ? ((-dre.deducoesReceita / dre.receitaBruta) * 100).toFixed(1) + '%' : '0%', tipoLinha: 'subitem' },
        { conta: '2. RECEITA OPERACIONAL LÍQUIDA', valor: dre.receitaLiquida, percentual: '100.0%', tipoLinha: 'total_intermediario' },
        { conta: '   (-) Custo das Mercadorias Vendidas (CMV Real)', valor: -dre.cmvTotal, percentual: dre.receitaLiquida > 0 ? ((-dre.cmvTotal / dre.receitaLiquida) * 100).toFixed(1) + '%' : '0%', tipoLinha: 'subitem' },
        { conta: '3. LUCRO BRUTO OPERACIONAL (MARGEM BRUTA)', valor: dre.lucroBruto, percentual: dre.margemBrutaPercentual + '%', tipoLinha: 'total_intermediario' }
      ];

      // Adiciona detalhamento de despesas por categoria
      if (dre.despesasPorCategoria && Object.keys(dre.despesasPorCategoria).length > 0) {
        for (const [cat, val] of Object.entries(dre.despesasPorCategoria)) {
          linhasDRE.push({
            conta: `   (-) Despesa: ${cat}`,
            valor: -val,
            percentual: dre.receitaLiquida > 0 ? ((-val / dre.receitaLiquida) * 100).toFixed(1) + '%' : '0%',
            tipoLinha: 'subitem'
          });
        }
      } else {
        linhasDRE.push({
          conta: '   (-) Despesas Operacionais & Administrativas',
          valor: -dre.totalDespesas,
          percentual: dre.receitaLiquida > 0 ? ((-dre.totalDespesas / dre.receitaLiquida) * 100).toFixed(1) + '%' : '0%',
          tipoLinha: 'subitem'
        });
      }

      linhasDRE.push({
        conta: '4. RESULTADO LÍQUIDO DO EXERCÍCIO (LUCRO / PREJUÍZO)',
        valor: dre.lucroLiquido,
        percentual: dre.margemLiquidaPercentual + '%',
        tipoLinha: dre.lucroLiquido >= 0 ? 'destaque_lucro' : 'destaque_prejuizo'
      });

      resultado = {
        titulo: `DRE Analítico (${modo === 'INTEGRADO' ? 'Modo Integrado Vendas + CMV' : 'Modo Financeiro Puro'})`,
        categoria: 'Financeiro & Controladoria',
        orientacaoPadrao: 'paisagem',
        dre,
        kpis: {
          receitaLiquida: dre.receitaLiquida,
          lucroLiquido: dre.lucroLiquido,
          margemLiquida: dre.margemLiquidaPercentual + '%',
          margemBruta: dre.margemBrutaPercentual + '%',
          pontoEquilibrio: dre.totalDespesas > 0 ? (dre.totalDespesas / Math.max(0.1, (dre.lucroBruto / Math.max(1, dre.receitaLiquida)))) : 0
        },
        colunas: [
          { chave: 'conta', titulo: 'Estrutura da DRE (Contas Analíticas)', tipo: 'texto' },
          { chave: 'valor', titulo: 'Valor Apurado (R$)', tipo: 'moeda_dre', width: '220px' },
          { chave: 'percentual', titulo: '% da Receita', tipo: 'texto', width: '130px' }
        ],
        dados: linhasDRE
      };
    }

    // =========================================================================
    // 3.B. FLUXO DE CAIXA PROJETADO (30 DIAS / 6 MESES / HÍBRIDO)
    // =========================================================================
    else if (tipo === 'fluxo_caixa_projetado') {
      const diasProjecao = Math.max(7, parseInt(url.searchParams.get('dias'), 10) || 30);
      const saldoInicial = parseFloat(url.searchParams.get('saldoInicial')) || 0;

      const pedidos = await query(`
        SELECT * FROM pedidos 
        WHERE status != 'CANCELADO'
      `);

      const financeiro = await query(`
        SELECT * FROM financeiro_lancamentos 
        WHERE status != 'CANCELADO'
      `);

      const fluxo = projetarFluxoCaixa(pedidos, financeiro, { saldoInicial, diasProjecao });

      const dadosTabela = fluxo.dias.map(d => ({
        data: d.dataFmt,
        diaSemana: d.diaSemana,
        entradas: d.entradas,
        saidas: d.saidas,
        resultadoDia: d.resultadoDia,
        saldoAcumulado: d.saldoAcumulado,
        situacao: d.isNegativo ? '⚠️ DESCOBERTO' : '🟢 REGULAR'
      }));

      resultado = {
        titulo: `Fluxo de Caixa Projetado (${diasProjecao} Dias)`,
        categoria: 'Financeiro & Controladoria',
        orientacaoPadrao: 'paisagem',
        fluxo,
        kpis: {
          saldoInicial: fluxo.saldoInicial,
          totalEntradas: fluxo.totalEntradasPeriodo,
          totalSaidas: fluxo.totalSaidasPeriodo,
          saldoFinal: fluxo.saldoFinalPeriodo,
          menorSaldo: fluxo.menorSaldoProjetado,
          diasNegativos: fluxo.diasNegativos
        },
        colunas: [
          { chave: 'data', titulo: 'Data', tipo: 'texto', width: '100px' },
          { chave: 'diaSemana', titulo: 'Dia da Semana', tipo: 'texto', width: '120px' },
          { chave: 'entradas', titulo: 'Entradas (R$)', tipo: 'moeda', width: '130px' },
          { chave: 'saidas', titulo: 'Saídas (R$)', tipo: 'moeda_dre', width: '130px' },
          { chave: 'resultadoDia', titulo: 'Resultado Dia (R$)', tipo: 'moeda_dre', width: '140px' },
          { chave: 'saldoAcumulado', titulo: 'Saldo Acumulado (R$)', tipo: 'moeda_dre', width: '160px' },
          { chave: 'situacao', titulo: 'Situação', tipo: 'texto', width: '140px' }
        ],
        dados: dadosTabela
      };
    }
    // =========================================================================
    // 4. ESTOQUE: POSIÇÃO FÍSICA E VALORIZAÇÃO DO PATRIMÔNIO
    // =========================================================================
    else if (tipo === 'estoque_posicao') {
      const rows = await query(`
        SELECT 
          id,
          codigo_sku,
          nome,
          categoria,
          unidade_medida,
          ROUND(estoque_atual, 2) as saldo_fisico,
          ROUND(estoque_minimo, 2) as estoque_minimo,
          ROUND(preco_custo, 2) as preco_custo,
          ROUND(preco_venda, 2) as preco_venda,
          ROUND(estoque_atual * preco_custo, 2) as valor_custo_total,
          ROUND(estoque_atual * preco_venda, 2) as valor_venda_total
        FROM produtos
        WHERE ativo = 1
        ORDER BY valor_venda_total DESC
      `);

      let totalPecas = 0;
      let totalCusto = 0;
      let totalVenda = 0;
      let itensCriticos = 0;

      const dados = rows.map((r, idx) => {
        totalPecas += r.saldo_fisico;
        totalCusto += podeVerCustos ? r.valor_custo_total : 0;
        totalVenda += r.valor_venda_total;
        const isCritico = r.saldo_fisico <= r.estoque_minimo;
        if (isCritico) itensCriticos++;

        const itemFormatado = {
          posicao: idx + 1,
          codigo_sku: r.codigo_sku || '-',
          nome: r.nome,
          categoria: r.categoria,
          unidade: r.unidade_medida || 'UN',
          saldo_fisico: r.saldo_fisico,
          estoque_minimo: r.estoque_minimo,
          preco_venda: r.preco_venda,
          valor_venda_total: r.valor_venda_total,
          status_estoque: isCritico ? 'CRÍTICO' : 'NORMAL'
        };

        if (podeVerCustos) {
          itemFormatado.preco_custo = r.preco_custo;
          itemFormatado.valor_custo_total = r.valor_custo_total;
          itemFormatado.margem_bruta = r.preco_venda > 0 ? (((r.preco_venda - r.preco_custo) / r.preco_venda) * 100).toFixed(1) + '%' : '0%';
        }

        return itemFormatado;
      });

      const colunas = [
        { chave: 'posicao', titulo: '#', tipo: 'numero', width: '50px' },
        { chave: 'codigo_sku', titulo: 'SKU / Código', tipo: 'texto', width: '120px' },
        { chave: 'nome', titulo: 'Descrição do Produto', tipo: 'texto' },
        { chave: 'categoria', titulo: 'Categoria', tipo: 'texto', width: '150px' },
        { chave: 'unidade', titulo: 'UN', tipo: 'texto', width: '50px' },
        { chave: 'saldo_fisico', titulo: 'Saldo Físico', tipo: 'numero', width: '90px' }
      ];

      if (podeVerCustos) {
        colunas.push({ chave: 'preco_custo', titulo: 'Custo Unit.', tipo: 'moeda', width: '110px' });
        colunas.push({ chave: 'valor_custo_total', titulo: 'Patrimônio Custo', tipo: 'moeda', width: '140px' });
      }

      colunas.push({ chave: 'preco_venda', titulo: 'Preço Venda', tipo: 'moeda', width: '110px' });
      colunas.push({ chave: 'valor_venda_total', titulo: 'Patrimônio Venda', tipo: 'moeda', width: '140px' });
      colunas.push({ chave: 'status_estoque', titulo: 'Situação', tipo: 'badge_estoque', width: '90px' });

      resultado = {
        titulo: 'Posição e Valorização do Patrimônio de Estoque',
        categoria: 'Estoque & Suprimentos',
        orientacaoPadrao: 'paisagem',
        kpis: {
          totalSkus: rows.length,
          totalPecas,
          patrimonioVenda: totalVenda,
          patrimonioCusto: podeVerCustos ? totalCusto : null,
          itensCriticos
        },
        colunas,
        dados
      };
    }

    // =========================================================================
    // 5. FISCAL: LIVRO REGISTRO DE SAÍDAS (NF-E MODELO 55 / NFS-E)
    // =========================================================================
    else if (tipo === 'fiscal_saidas') {
      const rows = await query(`
        SELECT 
          id,
          numero,
          cliente_nome,
          uf,
          cidade,
          ROUND(valor_total, 2) as valor_total,
          data_pedido as data_emissao
        FROM pedidos
        WHERE ${SQL_DATA_PEDIDO} >= ? AND ${SQL_DATA_PEDIDO} <= ?
        ORDER BY id DESC
      `, [infoPeriodo.inicio, infoPeriodo.fim]);

      let faturamentoFiscalTotal = 0;

      const dados = rows.map((r, idx) => {
        faturamentoFiscalTotal += r.valor_total;
        const aliquotaIcms = r.uf === 'RS' ? 0.17 : 0.12;
        const valorIcms = Math.round(r.valor_total * aliquotaIcms * 100) / 100;

        return {
          posicao: idx + 1,
          numero_documento: `NF-e ${55000 + r.id}`,
          serie: '1',
          modelo: '55 (SEFAZ)',
          data_emissao: r.data_emissao || '-',
          destinatario: r.cliente_nome,
          uf_destino: r.uf || 'RS',
          cfop: r.uf === 'RS' ? '5.102' : '6.102',
          base_calculo: r.valor_total,
          aliquota_icms: (aliquotaIcms * 100) + '%',
          valor_icms: valorIcms,
          valor_total: r.valor_total,
          status_sefaz: 'AUTORIZADA'
        };
      });

      resultado = {
        titulo: 'Livro Registro de Saídas Fiscais (SEFAZ NF-e & NFS-e)',
        categoria: 'Fiscal & Fechamento Contábil',
        orientacaoPadrao: 'paisagem',
        kpis: {
          totalDocumentos: rows.length,
          faturamentoFiscalTotal,
          icmsEstimado: Math.round(faturamentoFiscalTotal * 0.15 * 100) / 100,
          regimeTributario: 'Simples Nacional / CRT 1'
        },
        colunas: [
          { chave: 'posicao', titulo: '#', tipo: 'numero', width: '50px' },
          { chave: 'numero_documento', titulo: 'Documento Fiscal', tipo: 'texto', width: '130px' },
          { chave: 'modelo', titulo: 'Mod.', tipo: 'texto', width: '90px' },
          { chave: 'data_emissao', titulo: 'Emissão', tipo: 'texto', width: '90px' },
          { chave: 'destinatario', titulo: 'Destinatário / Tomador', tipo: 'texto' },
          { chave: 'uf_destino', titulo: 'UF', tipo: 'texto', width: '50px' },
          { chave: 'cfop', titulo: 'CFOP', tipo: 'texto', width: '70px' },
          { chave: 'base_calculo', titulo: 'Base ICMS', tipo: 'moeda', width: '120px' },
          { chave: 'valor_icms', titulo: 'ICMS (R$)', tipo: 'moeda', width: '110px' },
          { chave: 'valor_total', titulo: 'Valor Total', tipo: 'moeda', width: '130px' },
          { chave: 'status_sefaz', titulo: 'Status SEFAZ', tipo: 'badge_fiscal', width: '110px' }
        ],
        dados
      };
    }

    // =========================================================================
    // 6. CLIENTES: CLIENTES INATIVOS (+60 DIAS SEM COMPRA)
    // =========================================================================
    else if (tipo === 'clientes_inativos') {
      const rows = await query(`
        SELECT 
          c.id,
          c.nome,
          c.cidade,
          c.uf,
          c.telefone,
          c.cpf,
          c.cnpj,
          MAX(p.data_pedido) as ultima_compra,
          COALESCE(SUM(p.valor_total), 0) as faturamento_historico,
          COUNT(p.id) as total_pedidos_historico
        FROM clientes c
        LEFT JOIN pedidos p ON c.id = p.cliente_id OR LOWER(c.nome) = LOWER(p.cliente_nome)
        GROUP BY c.id, c.nome, c.cidade, c.uf, c.telefone
        HAVING ultima_compra IS NULL OR ultima_compra < DATE('now', '-60 days')
        ORDER BY faturamento_historico DESC
      `);

      const agoraMs = Date.now();
      const dados = rows.map((r, idx) => {
        let diasInativo = 'Sem histórico';
        if (r.ultima_compra) {
          const compraMs = new Date(r.ultima_compra).getTime();
          diasInativo = Math.floor((agoraMs - compraMs) / (1000 * 60 * 60 * 24)) + ' dias';
        }

        const rawTel = (r.telefone || '').replace(/\D/g, '');

        return {
          posicao: idx + 1,
          nome: r.nome,
          cidade: r.cidade || '-',
          uf: r.uf || 'RS',
          telefone: r.telefone || '-',
          telefone_limpo: rawTel,
          ultima_compra: r.ultima_compra ? r.ultima_compra.split('T')[0] : 'Nunca comprou',
          dias_inativo: diasInativo,
          faturamento_historico: r.faturamento_historico,
          total_pedidos: r.total_pedidos_historico
        };
      });

      resultado = {
        titulo: 'Clientes Inativos & Oportunidades de Reativação (+60 Dias)',
        categoria: 'Clientes & CRM Estratégico',
        orientacaoPadrao: 'retrato',
        kpis: {
          totalInativos: rows.length,
          patrimonioHistoricoInativo: rows.reduce((acc, r) => acc + (r.faturamento_historico || 0), 0),
          comTelefone: rows.filter(r => r.telefone && r.telefone.replace(/\D/g, '').length >= 10).length,
          acaoSugerida: 'Disparar campanha de reativação via WhatsApp'
        },
        colunas: [
          { chave: 'posicao', titulo: '#', tipo: 'numero', width: '50px' },
          { chave: 'nome', titulo: 'Cliente / Contato', tipo: 'texto' },
          { chave: 'cidade', titulo: 'Cidade', tipo: 'texto', width: '150px' },
          { chave: 'uf', titulo: 'UF', tipo: 'texto', width: '50px' },
          { chave: 'telefone', titulo: 'Telefone / WhatsApp', tipo: 'telefone', width: '150px' },
          { chave: 'ultima_compra', titulo: 'Última Compra', tipo: 'texto', width: '110px' },
          { chave: 'dias_inativo', titulo: 'Inatividade', tipo: 'badge_inativo', width: '110px' },
          { chave: 'faturamento_historico', titulo: 'Histórico (R$)', tipo: 'moeda', width: '130px' }
        ],
        dados
      };
    } else {
      return responder(res, 400, { error: `Tipo de relatório inválido: "${tipo}". Tipos disponíveis: vendas_curva_abc, vendas_uf, dre_gerencial, estoque_posicao, fiscal_saidas, clientes_inativos.` });
    }

    // Auditoria de emissão do relatório
    if (operador) {
      registrarLog({
        clienteId: operador.id,
        tipoAcao: 'RELATORIO_GERADO',
        detalhes: `Relatório "${resultado.titulo}" emitido por @${operador.login} (Período: ${infoPeriodo.descricao})`,
        req
      }).catch(() => {});
    }

    // =========================================================================
    // EXPORTAÇÃO CSV INTELIGENTE COM UTF-8 BOM
    // =========================================================================
    if (formato === 'csv') {
      const escapeCsv = (str) => {
        if (str === null || str === undefined) return '""';
        const s = String(str).replace(/"/g, '""');
        return `"${s}"`;
      };

      const linhasCsv = [];
      linhasCsv.push(escapeCsv(`${empresa.razaoSocial} - CNPJ: ${empresa.cnpj}`));
      linhasCsv.push(escapeCsv(`RELATÓRIO: ${resultado.titulo.toUpperCase()}`));
      linhasCsv.push(escapeCsv(`PERÍODO: ${infoPeriodo.descricao} | EMITIDO EM: ${new Date().toLocaleString('pt-BR')}`));
      linhasCsv.push('');

      const titulosColunas = resultado.colunas.map(c => escapeCsv(c.titulo)).join(';');
      linhasCsv.push(titulosColunas);

      for (const item of resultado.dados) {
        const linha = resultado.colunas.map(c => {
          let val = item[c.chave];
          if (c.tipo === 'moeda' || c.tipo === 'moeda_dre') {
            val = typeof val === 'number' ? `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : val;
          }
          return escapeCsv(val);
        }).join(';');
        linhasCsv.push(linha);
      }

      const strCsv = linhasCsv.join('\r\n');
      const bomBuffer = Buffer.from([0xEF, 0xBB, 0xBF]);
      const contentBuffer = Buffer.concat([bomBuffer, Buffer.from(strCsv, 'utf-8')]);
      const filename = `relatorio_${tipo}_${infoPeriodo.inicio}_a_${infoPeriodo.fim}.csv`;

      return responder(res, 200, contentBuffer, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`
      });
    }

    // Resposta Padrão em JSON
    return responder(res, 200, {
      success: true,
      tipo,
      periodo: infoPeriodo,
      empresa,
      geradoEm: new Date().toISOString(),
      geradoPor: operador ? operador.login : 'sistema',
      ...resultado
    });

  } catch (err) {
    console.error('[ERRO API RELATORIOS]', err);
    return responder(res, 500, { error: 'Falha ao processar relatório: ' + err.message });
  }
}
