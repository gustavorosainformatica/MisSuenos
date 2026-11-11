/**
 * Módulo de Conciliação Bancária & Reconciliação Financeira (Tickets 8, 9 & 10)
 * Parsers de arquivos OFX (SGML/XML) e CSV com Motor Heurístico de Matching
 * Autor: Gustavo Rosa Informática / Mis Sueños ERP & ERP Base Universal
 */

import crypto from 'node:crypto';

/**
 * Normaliza texto para comparações sem acentuação e em caixa alta
 */
export function normalizarTextoConciliacao(texto) {
  if (!texto) return '';
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

/**
 * Converte data no formato OFX (ex: 20261110120000[-03:EST] ou 20261110) para YYYY-MM-DD
 */
export function parseDataOfx(dataOfx) {
  if (!dataOfx) return new Date().toISOString().split('T')[0];
  const limpo = String(dataOfx).trim();
  if (limpo.length >= 8) {
    const ano = limpo.substring(0, 4);
    const mes = limpo.substring(4, 6);
    const dia = limpo.substring(6, 8);
    return `${ano}-${mes}-${dia}`;
  }
  return limpo;
}

/**
 * Converte valor numérico em string (formatos brasileiro ou internacional) para número float seguro
 */
export function parseValorDecimal(valorStr) {
  if (typeof valorStr === 'number') return valorStr;
  if (!valorStr) return 0;

  let limpo = String(valorStr).trim();
  // Se estiver entre parênteses, é negativo: (123.45) -> -123.45
  const isParenteses = limpo.startsWith('(') && limpo.endsWith(')');
  limpo = limpo.replace(/[()]/g, '');

  // Remove moeda e espaços
  limpo = limpo.replace(/R\$/gi, '').replace(/\s/g, '');

  let isNegativo = isParenteses || limpo.includes('-');
  limpo = limpo.replace(/-/g, '');

  // Se tiver vírgula e ponto (ex: 1.250,50 ou 1,250.50)
  if (limpo.includes('.') && limpo.includes(',')) {
    if (limpo.lastIndexOf(',') > limpo.lastIndexOf('.')) {
      // Formato Brasileiro: 1.250,50
      limpo = limpo.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato Internacional: 1,250.50
      limpo = limpo.replace(/,/g, '');
    }
  } else if (limpo.includes(',')) {
    // Apenas vírgula: 150,50 -> 150.50
    limpo = limpo.replace(',', '.');
  }

  const num = parseFloat(limpo) || 0;
  return isNegativo ? -Math.abs(num) : Math.abs(num);
}

/**
 * Parser de arquivos bancários OFX (Open Financial Exchange) nos padrões SGML (OFX 1.x) e XML (OFX 2.x)
 */
export function parseOfx(conteudoOfx) {
  if (!conteudoOfx || typeof conteudoOfx !== 'string') {
    throw new Error('Conteúdo do arquivo OFX inválido ou vazio.');
  }

  // 1. Extração de Metadados de Cabeçalho e Conta
  const bankIdMatch = conteudoOfx.match(/<BANKID>([\s\S]*?)(?:<\/BANKID>|\r?\n)/i);
  const branchIdMatch = conteudoOfx.match(/<BRANCHID>([\s\S]*?)(?:<\/BRANCHID>|\r?\n)/i);
  const acctIdMatch = conteudoOfx.match(/<ACCTID>([\s\S]*?)(?:<\/ACCTID>|\r?\n)/i);
  const curDefMatch = conteudoOfx.match(/<CURDEF>([\s\S]*?)(?:<\/CURDEF>|\r?\n)/i);
  const dtStartMatch = conteudoOfx.match(/<DTSTART>([\s\S]*?)(?:<\/DTSTART>|\r?\n)/i);
  const dtEndMatch = conteudoOfx.match(/<DTEND>([\s\S]*?)(?:<\/DTEND>|\r?\n)/i);
  const balAmtMatch = conteudoOfx.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([\s\S]*?)(?:<\/BALAMT>|\r?\n)/i);

  const banco = bankIdMatch ? bankIdMatch[1].trim() : 'BANCO';
  const agencia = branchIdMatch ? branchIdMatch[1].trim() : '';
  const conta = acctIdMatch ? acctIdMatch[1].trim() : '';
  const moeda = curDefMatch ? curDefMatch[1].trim().toUpperCase() : 'BRL';
  const dataInicio = dtStartMatch ? parseDataOfx(dtStartMatch[1]) : null;
  const dataFim = dtEndMatch ? parseDataOfx(dtEndMatch[1]) : null;
  const saldoFinal = balAmtMatch ? parseValorDecimal(balAmtMatch[1]) : null;

  // 2. Extração de Transações (<STMTTRN>...</STMTTRN> ou blocos SGML)
  const transacoes = [];
  const stmtTrnRegex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>))/gi;
  let match;

  while ((match = stmtTrnRegex.exec(conteudoOfx)) !== null) {
    const bloco = match[1];

    const trnTypeMatch = bloco.match(/<TRNTYPE>([\s\S]*?)(?:<\/TRNTYPE>|\r?\n)/i);
    const dtPostedMatch = bloco.match(/<DTPOSTED>([\s\S]*?)(?:<\/DTPOSTED>|\r?\n)/i);
    const trnAmtMatch = bloco.match(/<TRNAMT>([\s\S]*?)(?:<\/TRNAMT>|\r?\n)/i);
    const fitidMatch = bloco.match(/<FITID>([\s\S]*?)(?:<\/FITID>|\r?\n)/i);
    const checkNumMatch = bloco.match(/<CHECKNUM>([\s\S]*?)(?:<\/CHECKNUM>|\r?\n)/i);
    const refNumMatch = bloco.match(/<REFNUM>([\s\S]*?)(?:<\/REFNUM>|\r?\n)/i);
    const memoMatch = bloco.match(/<MEMO>([\s\S]*?)(?:<\/MEMO>|\r?\n)/i);

    const valorBruto = trnAmtMatch ? parseValorDecimal(trnAmtMatch[1]) : 0;
    const trnType = trnTypeMatch ? trnTypeMatch[1].trim().toUpperCase() : '';
    const rawData = dtPostedMatch ? dtPostedMatch[1].trim() : '';
    const dataTransacao = parseDataOfx(rawData);

    // Tipo financeiro: Crédito (entrada de fundos) ou Débito (saída)
    const isCredito = valorBruto > 0 || trnType === 'CREDIT' || trnType === 'DEP' || trnType === 'DIRECTDEP';
    const tipo = isCredito ? 'CREDITO' : 'DEBITO';
    const valorAbsoluto = Math.round(Math.abs(valorBruto) * 100) / 100;

    // Memo limpo
    let memo = memoMatch ? memoMatch[1].trim() : 'TRANSACAO BANCARIA';
    memo = memo.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
    memo = normalizarTextoConciliacao(memo);

    // FITID único
    let fitid = fitidMatch ? fitidMatch[1].trim() : '';
    if (!fitid) {
      // Fallback determinístico
      fitid = crypto.createHash('sha1').update(`${banco}_${dataTransacao}_${valorBruto}_${memo}`).digest('hex').substring(0, 20);
    }

    const documento = checkNumMatch ? checkNumMatch[1].trim() : (refNumMatch ? refNumMatch[1].trim() : '');

    transacoes.push({
      fitid,
      tipo,
      data: dataTransacao,
      valor: valorAbsoluto,
      valor_bruto: valorBruto,
      descricao: memo,
      memo,
      documento,
      trntype: trnType,
      origem: 'OFX'
    });
  }

  let totalCreditos = 0;
  let totalDebitos = 0;
  transacoes.forEach(t => {
    if (t.tipo === 'CREDITO') totalCreditos += t.valor;
    else totalDebitos += t.valor;
  });

  return {
    success: true,
    formato: 'OFX',
    banco,
    agencia,
    conta,
    moeda,
    dataInicio,
    dataFim,
    saldoFinal,
    totalTransacoes: transacoes.length,
    totalCreditos: Math.round(totalCreditos * 100) / 100,
    totalDebitos: Math.round(totalDebitos * 100) / 100,
    transacoes
  };
}

/**
 * Parser inteligente de extratos bancários em CSV com autodetecção de delimitador e colunas
 */
export function parseCsvBancario(conteudoCsv, opcoes = {}) {
  if (!conteudoCsv || typeof conteudoCsv !== 'string') {
    throw new Error('Conteúdo do arquivo CSV inválido ou vazio.');
  }

  const linhas = conteudoCsv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (linhas.length < 2) {
    throw new Error('O arquivo CSV deve conter ao menos o cabeçalho e uma linha de transação.');
  }

  // 1. Autodetecção do delimitador na linha de cabeçalho
  const linhaHeader = linhas[0];
  const countPontoVirgula = (linhaHeader.match(/;/g) || []).length;
  const countVirgula = (linhaHeader.match(/,/g) || []).length;
  const countTab = (linhaHeader.match(/\t/g) || []).length;

  let delimitador = ';';
  if (countTab > countPontoVirgula && countTab > countVirgula) delimitador = '\t';
  else if (countVirgula > countPontoVirgula) delimitador = ',';

  // 2. Mapeamento de colunas pelo cabeçalho
  const colunas = linhaHeader.split(delimitador).map(c => normalizarTextoConciliacao(c.replace(/["']/g, '')));
  
  let idxData = -1;
  let idxDescricao = -1;
  let idxValor = -1;
  let idxCredito = -1;
  let idxDebito = -1;
  let idxId = -1;

  colunas.forEach((col, idx) => {
    if (col.includes('DATA') || col.includes('DATE') || col.includes('DT')) {
      if (idxData === -1) idxData = idx;
    } else if (col.includes('VALOR') || col.includes('AMOUNT') || col.includes('LANCAMENTO')) {
      if (idxValor === -1) idxValor = idx;
    } else if (col.includes('CREDITO') || col.includes('ENTRADA') || col.includes('RECEITA')) {
      idxCredito = idx;
    } else if (col.includes('DEBITO') || col.includes('SAIDA') || col.includes('DESPESA')) {
      idxDebito = idx;
    } else if (col.includes('HISTORICO') || col.includes('DESCRICAO') || col.includes('MEMO') || col.includes('DETALHE') || col.includes('TITULO')) {
      if (idxDescricao === -1) idxDescricao = idx;
    } else if (col.includes('ID') || col.includes('FITID') || col.includes('DOCUMENTO') || col.includes('DOCTO') || col.includes('NUMERO')) {
      if (idxId === -1) idxId = idx;
    }
  });

  // Fallbacks razoáveis caso não localize colunas exatas
  if (idxData === -1) idxData = 0;
  if (idxDescricao === -1) idxDescricao = colunas.length > 2 ? 1 : 0;
  if (idxValor === -1 && idxCredito === -1 && idxDebito === -1) idxValor = colunas.length - 1;

  const bancoNome = opcoes.banco || 'BANCO_CSV';
  const transacoes = [];

  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha) continue;

    // Split respeitando aspas
    const partes = [];
    let atual = '';
    let dentroAspas = false;

    for (let c = 0; c < linha.length; c++) {
      const char = linha[c];
      if (char === '"' || char === "'") {
        dentroAspas = !dentroAspas;
      } else if (char === delimitador && !dentroAspas) {
        partes.push(atual.trim().replace(/^["']|["']$/g, ''));
        atual = '';
      } else {
        atual += char;
      }
    }
    partes.push(atual.trim().replace(/^["']|["']$/g, ''));

    if (partes.length < 2) continue;

    // Normalização da data
    const rawData = partes[idxData] || '';
    let dataIso = '';
    if (rawData.includes('/')) {
      // Formato DD/MM/YYYY
      const dPartes = rawData.split('/');
      if (dPartes.length === 3) {
        const dia = dPartes[0].padStart(2, '0');
        const mes = dPartes[1].padStart(2, '0');
        const ano = dPartes[2].length === 2 ? `20${dPartes[2]}` : dPartes[2];
        dataIso = `${ano}-${mes}-${dia}`;
      }
    } else if (rawData.includes('-')) {
      // Formato YYYY-MM-DD
      dataIso = rawData.substring(0, 10);
    }
    if (!dataIso) dataIso = new Date().toISOString().split('T')[0];

    // Normalização de valor e tipo
    let valorBruto = 0;
    if (idxCredito !== -1 && partes[idxCredito]) {
      const vCred = parseValorDecimal(partes[idxCredito]);
      if (vCred > 0) valorBruto = vCred;
    }
    if (idxDebito !== -1 && partes[idxDebito]) {
      const vDeb = parseValorDecimal(partes[idxDebito]);
      if (vDeb > 0) valorBruto = -vDeb;
    }
    if (valorBruto === 0 && idxValor !== -1 && partes[idxValor]) {
      valorBruto = parseValorDecimal(partes[idxValor]);
    }

    if (valorBruto === 0) continue; // Ignora linhas zeradas de resumo

    const isCredito = valorBruto > 0;
    const tipo = isCredito ? 'CREDITO' : 'DEBITO';
    const valorAbsoluto = Math.round(Math.abs(valorBruto) * 100) / 100;

    const descricao = normalizarTextoConciliacao(partes[idxDescricao] || 'LANCAMENTO BANCARIO');
    const docId = idxId !== -1 ? (partes[idxId] || '') : '';

    const fitid = docId || crypto.createHash('sha1').update(`CSV_${bancoNome}_${i}_${dataIso}_${valorBruto}_${descricao}`).digest('hex').substring(0, 20);

    transacoes.push({
      fitid,
      tipo,
      data: dataIso,
      valor: valorAbsoluto,
      valor_bruto: valorBruto,
      descricao,
      memo: descricao,
      documento: docId,
      origem: 'CSV'
    });
  }

  let totalCreditos = 0;
  let totalDebitos = 0;
  transacoes.forEach(t => {
    if (t.tipo === 'CREDITO') totalCreditos += t.valor;
    else totalDebitos += t.valor;
  });

  return {
    success: true,
    formato: 'CSV',
    delimitador,
    banco: bancoNome,
    totalTransacoes: transacoes.length,
    totalCreditos: Math.round(totalCreditos * 100) / 100,
    totalDebitos: Math.round(totalDebitos * 100) / 100,
    transacoes
  };
}

/**
 * Algoritmo Heurístico de Correspondência (Matching Engine) entre Transação do Extrato e Lançamento do ERP
 * Retorna pontuação de 0.0 a 1.0 e nível de confiança
 */
export function calcularScoreMatching(transacaoExtrato, lancamentoErp) {
  if (!transacaoExtrato || !lancamentoErp) {
    return { score: 0.0, confianca: 'SEM_MATCH', motivos: ['Dados incompletos'] };
  }

  // 1. Validação de Compatibilidade de Fluxo (Crédito x Receber / Débito x Pagar)
  const isCredito = transacaoExtrato.tipo === 'CREDITO' || transacaoExtrato.valor_bruto > 0;
  const isPagar = lancamentoErp.tipo === 'PAGAR' || lancamentoErp.tipo === 'DESPESA';
  const isReceber = lancamentoErp.tipo === 'RECEBER' || lancamentoErp.tipo === 'RECEITA';

  if ((isCredito && isPagar) || (!isCredito && isReceber)) {
    return {
      score: 0.0,
      confianca: 'INCOMPATIVEL',
      motivos: ['Fluxo oposto (crédito bancário não pode conciliar com contas a pagar ou vice-versa)']
    };
  }

  let score = 0.0;
  const motivos = [];

  const valExtrato = Math.abs(transacaoExtrato.valor);
  const valErp = Math.abs(parseFloat(lancamentoErp.valor) || 0);
  const difValor = Math.abs(valExtrato - valErp);

  // 2. Pontuação por Valor (Peso Máximo: 0.50)
  if (difValor < 0.01) {
    score += 0.50;
    motivos.push('Valor idêntico');
  } else if (difValor <= 0.50) {
    score += 0.40;
    motivos.push(`Divergência mínima de centavos (R$ ${difValor.toFixed(2)})`);
  } else if (difValor <= 2.50) {
    score += 0.25;
    motivos.push(`Divergência compatível com tarifas bancárias (R$ ${difValor.toFixed(2)})`);
  } else {
    // Se o valor divergir além de R$ 2,50, não considera match automático
    return {
      score: 0.0,
      confianca: 'SEM_MATCH',
      motivos: [`Valores muito distintos (Extrato: R$ ${valExtrato.toFixed(2)}, ERP: R$ ${valErp.toFixed(2)})`]
    };
  }

  // 3. Pontuação por Data (Peso Máximo: 0.30)
  const dataExtrato = transacaoExtrato.data ? new Date(transacaoExtrato.data) : null;
  const dataErpStr = lancamentoErp.data_vencimento || lancamentoErp.data_pagamento || lancamentoErp.data_cadastro;
  const dataErp = dataErpStr ? new Date(dataErpStr) : null;

  if (dataExtrato && dataErp && !isNaN(dataExtrato.getTime()) && !isNaN(dataErp.getTime())) {
    const diffMs = Math.abs(dataExtrato.getTime() - dataErp.getTime());
    const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDias === 0) {
      score += 0.30;
      motivos.push('Data exata');
    } else if (diffDias <= 2) {
      score += 0.25;
      motivos.push(`Data próxima (+/- ${diffDias} dias)`);
    } else if (diffDias <= 5) {
      score += 0.15;
      motivos.push(`Janela semanal (+/- ${diffDias} dias)`);
    } else if (diffDias <= 10) {
      score += 0.05;
      motivos.push(`Data com tolerância estendida (+/- ${diffDias} dias)`);
    }
  }

  // 4. Pontuação por Texto, Cliente, Fornecedor ou Documento (Peso Máximo: 0.20)
  const memoNorm = normalizarTextoConciliacao(transacaoExtrato.descricao || transacaoExtrato.memo || '');
  const clienteNorm = normalizarTextoConciliacao(lancamentoErp.cliente_nome || '');
  const fornecedorNorm = normalizarTextoConciliacao(lancamentoErp.fornecedor_nome || '');
  const descErpNorm = normalizarTextoConciliacao(lancamentoErp.descricao || '');
  const docRefNorm = normalizarTextoConciliacao(lancamentoErp.chave_nfe_origem || lancamentoErp.pedido_id || '');

  let matchTexto = false;
  if (clienteNorm && memoNorm.includes(clienteNorm)) {
    matchTexto = true;
    motivos.push(`Nome do cliente identificado no memo ("${clienteNorm}")`);
  } else if (fornecedorNorm && memoNorm.includes(fornecedorNorm)) {
    matchTexto = true;
    motivos.push(`Nome do fornecedor identificado no memo ("${fornecedorNorm}")`);
  } else if (descErpNorm && (memoNorm.includes(descErpNorm) || descErpNorm.includes(memoNorm))) {
    matchTexto = true;
    motivos.push('Descrição compatível');
  } else if (docRefNorm && memoNorm.includes(docRefNorm)) {
    matchTexto = true;
    motivos.push('Número do documento/pedido identificado no memo');
  }

  if (matchTexto) {
    score += 0.20;
  }

  const scoreFinal = Math.min(1.0, Math.round(score * 100) / 100);

  let confianca = 'SEM_MATCH';
  if (scoreFinal >= 0.90) confianca = 'ALTA'; // Match Perfeito / Baixa recomendada
  else if (scoreFinal >= 0.70) confianca = 'MEDIA'; // Match Forte
  else if (scoreFinal >= 0.45) confianca = 'BAIXA'; // Match Sugerido para inspeção visual

  return {
    score: scoreFinal,
    confianca,
    auto_conciliavel: scoreFinal >= 0.90,
    dif_valor: Math.round(difValor * 100) / 100,
    motivos
  };
}

/**
 * Reconcilia um lote de transações bancárias contra lançamentos do ERP
 */
export function conciliarExtratoComLancamentos(transacoesExtrato = [], lancamentosErp = [], opcoes = {}) {
  const thresholdMinimo = opcoes.thresholdMinimo || 0.45;
  const lancamentosDisponiveis = [...lancamentosErp];

  const resultados = transacoesExtrato.map(extratoItem => {
    let melhorMatch = null;
    let melhorScore = -1;
    let melhorIndiceLancamento = -1;

    lancamentosDisponiveis.forEach((erpItem, idx) => {
      const avaliacao = calcularScoreMatching(extratoItem, erpItem);
      if (avaliacao.score > melhorScore && avaliacao.score >= thresholdMinimo) {
        melhorScore = avaliacao.score;
        melhorMatch = {
          lancamento_id: erpItem.id,
          tipo: erpItem.tipo,
          descricao: erpItem.descricao,
          valor: erpItem.valor,
          data_vencimento: erpItem.data_vencimento,
          cliente_nome: erpItem.cliente_nome,
          fornecedor_nome: erpItem.fornecedor_nome,
          status_erp: erpItem.status,
          avaliacao
        };
        melhorIndiceLancamento = idx;
      }
    });

    // Se encontrou match com alta confiança, retira da lista disponível para não duplicar conciliação
    if (melhorMatch && melhorScore >= 0.85 && melhorIndiceLancamento !== -1) {
      lancamentosDisponiveis.splice(melhorIndiceLancamento, 1);
    }

    return {
      transacao_extrato: extratoItem,
      possui_match: melhorMatch !== null,
      score: melhorScore > 0 ? melhorScore : 0.0,
      confianca: melhorMatch?.avaliacao?.confianca || 'SEM_MATCH',
      auto_conciliavel: melhorMatch?.avaliacao?.auto_conciliavel || false,
      sugestao: melhorMatch
    };
  });

  const totalAuto = resultados.filter(r => r.auto_conciliavel).length;
  const totalComMatch = resultados.filter(r => r.possui_match).length;
  const totalSemMatch = resultados.filter(r => !r.possui_match).length;

  return {
    success: true,
    total_transacoes: transacoesExtrato.length,
    total_auto_conciliavel: totalAuto,
    total_com_match: totalComMatch,
    total_sem_match: totalSemMatch,
    resultados
  };
}

