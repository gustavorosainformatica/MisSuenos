/**
 * Módulo de Engenharia de Suprimentos & Compras
 * Parser Especializado de XML NF-e (Modelo 55) e Algoritmo De-Para Inteligente
 * 
 * Funcionalidades:
 * - Extração detalhada de chaves de 44 dígitos, emitente, destinatário, itens e duplicatas
 * - Suporte a tags com ou sem namespaces (ex: <nfe:det> ou <det>) e entidades XML (&amp;, &quot;)
 * - Algoritmo De-Para com auto-aprendizagem (memorização em fornecedores_produtos_vinculo)
 * - Identificação por EAN/GTIN e correspondência por similaridade de nome
 * - Tratamento de fator de conversão de embalagem (ex: CX com 12 vira 12 UN)
 */

import * as dbModule from './db.js';

/**
 * Desescapa entidades XML padrão
 */
export function decodificarXml(texto) {
  if (!texto) return '';
  return String(texto)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

/**
 * Extrai o conteúdo da primeira ocorrência de uma tag XML (com ou sem namespace)
 */
export function extrairTag(xml, tag) {
  if (!xml) return '';
  const regex = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${tag}>`, 'i');
  const m = xml.match(regex);
  return m ? decodificarXml(m[1]) : '';
}

/**
 * Extrai todas as ocorrências de um bloco de tag repetitiva (ex: <det>, <dup>)
 */
export function extrairBlocos(xml, tag) {
  if (!xml) return [];
  const regex = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${tag}>`, 'gi');
  const blocos = [];
  let m;
  while ((m = regex.exec(xml)) !== null) {
    blocos.push(m[1]);
  }
  return blocos;
}

/**
 * Faz o parse completo de um XML de Nota Fiscal Eletrônica (Modelo 55 ou 65)
 * @param {string} xmlString Conteúdo em texto bruto do arquivo XML
 * @returns {object} Dados estruturados da NF-e
 */
export function parseXmlNfeCompleto(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') {
    throw new Error('Conteúdo XML inválido ou vazio.');
  }

  const temInfNfe = /<(?:[a-zA-Z0-9_]+:)?infNFe/i.test(xmlString);
  if (!temInfNfe) {
    throw new Error('O arquivo enviado não é um XML válido de Nota Fiscal Eletrônica (tag <infNFe> não encontrada).');
  }

  // 1. Chave de acesso de 44 dígitos
  let chaveAcesso = extrairTag(xmlString, 'chNFe');
  if (!chaveAcesso) {
    const matchId = xmlString.match(/Id=["'](?:NFe)?(\d{44})["']/i);
    if (matchId) chaveAcesso = matchId[1];
  }
  if (!chaveAcesso) {
    // Fallback de contingência
    chaveAcesso = 'NFE-' + Date.now();
  }

  // 2. Dados Gerais de Identificação (<ide>)
  const ideBloco = extrairTag(xmlString, 'ide');
  const numeroNfe = extrairTag(ideBloco, 'nNF') || 'S/N';
  const serieNfe = extrairTag(ideBloco, 'serie') || '1';
  const modelo = extrairTag(ideBloco, 'mod') || '55';
  const naturezaOperacao = extrairTag(ideBloco, 'natOp') || 'COMPRA';
  const dhEmi = extrairTag(ideBloco, 'dhEmi') || extrairTag(ideBloco, 'dEmi') || new Date().toISOString();
  const dataEmissao = dhEmi.slice(0, 10);
  const tipoOperacao = extrairTag(ideBloco, 'tpNF') === '0' ? 'ENTRADA' : 'SAIDA';

  // 3. Emitente (Fornecedor) (<emit>)
  const emitBloco = extrairTag(xmlString, 'emit');
  const enderEmit = extrairTag(emitBloco, 'enderEmit');
  const documentoFornecedor = (extrairTag(emitBloco, 'CNPJ') || extrairTag(emitBloco, 'CPF')).replace(/\D/g, '');
  const razaoSocialFornecedor = extrairTag(emitBloco, 'xNome') || 'FORNECEDOR XML';
  const nomeFantasiaFornecedor = extrairTag(emitBloco, 'xFant') || razaoSocialFornecedor;

  const fornecedor = {
    documento: documentoFornecedor,
    cnpj: documentoFornecedor,
    razao_social: razaoSocialFornecedor.toUpperCase(),
    nome_fantasia: nomeFantasiaFornecedor.toUpperCase(),
    ie: extrairTag(emitBloco, 'IE') || '',
    crt: extrairTag(emitBloco, 'CRT') || '1',
    logradouro: (extrairTag(enderEmit, 'xLgr') || '').toUpperCase(),
    numero: (extrairTag(enderEmit, 'nro') || '').toUpperCase(),
    complemento: (extrairTag(enderEmit, 'xCpl') || '').toUpperCase(),
    bairro: (extrairTag(enderEmit, 'xBairro') || '').toUpperCase(),
    cidade: (extrairTag(enderEmit, 'xMun') || '').toUpperCase(),
    uf: (extrairTag(enderEmit, 'UF') || 'RS').toUpperCase(),
    cep: (extrairTag(enderEmit, 'CEP') || '').replace(/\D/g, ''),
    telefone: (extrairTag(enderEmit, 'fone') || '').replace(/\D/g, '')
  };

  // 4. Destinatário (<dest>)
  const destBloco = extrairTag(xmlString, 'dest');
  const enderDest = extrairTag(destBloco, 'enderDest');
  const destinatario = {
    documento: (extrairTag(destBloco, 'CNPJ') || extrairTag(destBloco, 'CPF')).replace(/\D/g, ''),
    razao_social: (extrairTag(destBloco, 'xNome') || '').toUpperCase(),
    ie: extrairTag(destBloco, 'IE') || '',
    cidade: (extrairTag(enderDest, 'xMun') || '').toUpperCase(),
    uf: (extrairTag(enderDest, 'UF') || '').toUpperCase()
  };

  // 5. Totais da Nota (<total><ICMSTot>)
  const totalBloco = extrairTag(xmlString, 'ICMSTot');
  const totais = {
    valor_produtos: parseFloat(extrairTag(totalBloco, 'vProd') || 0),
    valor_frete: parseFloat(extrairTag(totalBloco, 'vFrete') || 0),
    valor_seguro: parseFloat(extrairTag(totalBloco, 'vSeg') || 0),
    valor_desconto: parseFloat(extrairTag(totalBloco, 'vDesc') || 0),
    valor_outras_despesas: parseFloat(extrairTag(totalBloco, 'vOutro') || 0),
    valor_total_nota: parseFloat(extrairTag(totalBloco, 'vNF') || extrairTag(totalBloco, 'vProd') || 0),
    valor_bc_icms: parseFloat(extrairTag(totalBloco, 'vBC') || 0),
    valor_icms: parseFloat(extrairTag(totalBloco, 'vICMS') || 0),
    valor_ipi: parseFloat(extrairTag(totalBloco, 'vIPI') || 0),
    valor_pis: parseFloat(extrairTag(totalBloco, 'vPIS') || 0),
    valor_cofins: parseFloat(extrairTag(totalBloco, 'vCOFINS') || 0)
  };

  // 6. Faturas e Duplicatas (<cobr><dup>)
  const cobrBloco = extrairTag(xmlString, 'cobr');
  const blocosDup = extrairBlocos(cobrBloco, 'dup');
  const duplicatas = [];

  if (blocosDup.length > 0) {
    blocosDup.forEach((dupXml, idx) => {
      const vDup = parseFloat(extrairTag(dupXml, 'vDup') || 0);
      const dVenc = extrairTag(dupXml, 'dVenc') || dataEmissao;
      const nDup = extrairTag(dupXml, 'nDup') || String(idx + 1).padStart(3, '0');
      duplicatas.push({
        numero: nDup,
        vencimento: dVenc,
        valor: vDup
      });
    });
  }

  // Fallback caso não venham duplicatas explícitas mas haja valor de nota
  if (duplicatas.length === 0 && totais.valor_total_nota > 0) {
    duplicatas.push({
      numero: '001',
      vencimento: dataEmissao,
      valor: totais.valor_total_nota
    });
  }

  // 7. Itens da Nota (<det>)
  const blocosDet = extrairBlocos(xmlString, 'det');
  const itens = [];

  blocosDet.forEach((detXml, index) => {
    const prodXml = extrairTag(detXml, 'prod');
    if (!prodXml) return;

    let ean = extrairTag(prodXml, 'cEAN');
    if (ean === 'SEM GTIN' || !ean) ean = '';

    let eanTrib = extrairTag(prodXml, 'cEANTrib');
    if (eanTrib === 'SEM GTIN' || !eanTrib) eanTrib = '';

    const qCom = parseFloat(extrairTag(prodXml, 'qCom') || 1);
    const vUnCom = parseFloat(extrairTag(prodXml, 'vUnCom') || 0);
    const vProd = parseFloat(extrairTag(prodXml, 'vProd') || (qCom * vUnCom));

    // Impostos do item se destacados
    const impostoXml = extrairTag(detXml, 'imposto');
    const vICMS = parseFloat(extrairTag(impostoXml, 'vICMS') || 0);
    const vIPI = parseFloat(extrairTag(impostoXml, 'vIPI') || 0);
    const vPIS = parseFloat(extrairTag(impostoXml, 'vPIS') || 0);
    const vCOFINS = parseFloat(extrairTag(impostoXml, 'vCOFINS') || 0);

    itens.push({
      numero_item: index + 1,
      codigo: extrairTag(prodXml, 'cProd'),
      ean: ean,
      descricao: extrairTag(prodXml, 'xProd').toUpperCase(),
      ncm: extrairTag(prodXml, 'NCM'),
      cfop: extrairTag(prodXml, 'CFOP'),
      unidade: (extrairTag(prodXml, 'uCom') || 'UN').toUpperCase(),
      quantidade: qCom,
      valor_unitario: vUnCom,
      valor_total: vProd,
      ean_tributavel: eanTrib,
      unidade_tributavel: (extrairTag(prodXml, 'uTrib') || extrairTag(prodXml, 'uCom') || 'UN').toUpperCase(),
      quantidade_tributavel: parseFloat(extrairTag(prodXml, 'qTrib') || qCom),
      valor_unitario_tributavel: parseFloat(extrairTag(prodXml, 'vUnTrib') || vUnCom),
      valor_frete: parseFloat(extrairTag(prodXml, 'vFrete') || 0),
      valor_seguro: parseFloat(extrairTag(prodXml, 'vSeg') || 0),
      valor_desconto: parseFloat(extrairTag(prodXml, 'vDesc') || 0),
      valor_outras_despesas: parseFloat(extrairTag(prodXml, 'vOutro') || 0),
      impostos: {
        icms: vICMS,
        ipi: vIPI,
        pis: vPIS,
        cofins: vCOFINS
      }
    });
  });

  // 8. Informações Complementares (<infAdic>)
  const infAdicBloco = extrairTag(xmlString, 'infAdic');
  const informacoesComplementares = extrairTag(infAdicBloco, 'infCpl');

  return {
    chave_nfe: chaveAcesso,
    numero_nfe: numeroNfe,
    serie_nfe: serieNfe,
    modelo: modelo,
    natureza_operacao: naturezaOperacao,
    tipo_operacao: tipoOperacao,
    data_emissao: dataEmissao,
    hora_emissao: dhEmi,
    fornecedor,
    destinatario,
    totais,
    valor_total: totais.valor_total_nota,
    duplicatas,
    itens,
    informacoes_complementares: informacoesComplementares
  };
}

/**
 * Motor De-Para Inteligente: Resolve a correspondência entre um item do XML e o catálogo do ERP
 * 
 * Regra de Precedência:
 * 1. Correspondência exata em fornecedores_produtos_vinculo (fornecedor_id + codigo_fornecedor).
 * 2. Correspondência por Código de Barras (cEAN) no catálogo de produtos do ERP.
 * 3. Sugestão por correspondência de nome exato no catálogo.
 * 4. PENDENTE para seleção manual pelo operador.
 * 
 * @param {number} fornecedorId ID do fornecedor no ERP
 * @param {object} itemXml Item extraído da NF-e
 * @param {object} db Instância do módulo db (opcional para injeção de dependência)
 * @returns {Promise<object>} Status e resolução do vínculo De-Para
 */
export async function resolverDeParaItem(fornecedorId, itemXml, db = dbModule) {
  if (!itemXml) {
    return {
      vinculado: false,
      produtoErpId: null,
      produtoErpNome: null,
      fatorConversao: 1.0,
      unidadeErp: null,
      unidadeFornecedor: 'UN',
      confianca: 'PENDENTE',
      detalhes: 'Item não fornecido.'
    };
  }

  const codigoFornecedor = String(itemXml.codigo || '').trim();
  const eanFornecedor = String(itemXml.ean || '').trim();
  const unidadeFornecedor = String(itemXml.unidade || 'UN').toUpperCase();

  // 1. Prioridade 1: Vínculo prévio memorizado na tabela fornecedores_produtos_vinculo
  if (fornecedorId && codigoFornecedor) {
    const vinculo = await db.get(`
      SELECT 
        v.id as vinculo_id,
        v.produto_erp_id,
        v.fator_conversao,
        v.unidade_fornecedor,
        p.nome as produto_erp_nome,
        COALESCE(p.unidade_medida, 'UN') as unidade_erp,
        p.preco_custo,
        p.preco_venda,
        p.estoque_atual
      FROM fornecedores_produtos_vinculo v
      LEFT JOIN produtos p ON p.id = v.produto_erp_id
      WHERE v.fornecedor_id = ? AND v.codigo_fornecedor = ?
    `, [fornecedorId, codigoFornecedor]);

    if (vinculo) {
      return {
        vinculado: true,
        vinculoId: vinculo.vinculo_id,
        produtoErpId: vinculo.produto_erp_id,
        produtoErpNome: vinculo.produto_erp_nome,
        fatorConversao: Number(vinculo.fator_conversao || 1.0),
        unidadeErp: vinculo.unidade_erp || 'UN',
        unidadeFornecedor: vinculo.unidade_fornecedor || unidadeFornecedor,
        precoCustoAtual: Number(vinculo.preco_custo || 0),
        estoqueAtual: Number(vinculo.estoque_atual || 0),
        confianca: 'MEMORIZADO',
        detalhes: 'Vínculo De-Para previamente memorizado no sistema.'
      };
    }
  }

  // 2. Prioridade 2: Correspondência automática por EAN / Código de Barras no catálogo de produtos
  if (eanFornecedor && eanFornecedor.length >= 7 && /^\d+$/.test(eanFornecedor)) {
    const prodEan = await db.get(`
      SELECT id, nome, COALESCE(unidade_medida, 'UN') as unidade_erp, preco_custo, preco_venda, estoque_atual
      FROM produtos
      WHERE (codigo_barras = ? OR codigo_sku = ?) AND ativo = 1
      LIMIT 1
    `, [eanFornecedor, eanFornecedor]);

    if (prodEan) {
      return {
        vinculado: true,
        produtoErpId: prodEan.id,
        produtoErpNome: prodEan.nome,
        fatorConversao: 1.0,
        unidadeErp: prodEan.unidade_erp || 'UN',
        unidadeFornecedor: unidadeFornecedor,
        precoCustoAtual: Number(prodEan.preco_custo || 0),
        estoqueAtual: Number(prodEan.estoque_atual || 0),
        confianca: 'EAN',
        detalhes: 'Correspondência automática identificada pelo Código de Barras (EAN/GTIN).'
      };
    }
  }

  // 3. Prioridade 3: Sugestão por nome idêntico no catálogo de produtos
  const nomeItem = String(itemXml.descricao || '').trim().toUpperCase();
  if (nomeItem) {
    const prodNome = await db.get(`
      SELECT id, nome, COALESCE(unidade_medida, 'UN') as unidade_erp, preco_custo, preco_venda, estoque_atual
      FROM produtos
      WHERE UPPER(nome) = ? AND ativo = 1
      LIMIT 1
    `, [nomeItem]);

    if (prodNome) {
      return {
        vinculado: false,
        sugestaoId: prodNome.id,
        sugestaoNome: prodNome.nome,
        produtoErpId: null,
        produtoErpNome: null,
        fatorConversao: 1.0,
        unidadeErp: prodNome.unidade_erp || 'UN',
        unidadeFornecedor: unidadeFornecedor,
        confianca: 'SUGESTAO_NOME',
        detalhes: 'Sugestão automática baseada no nome idêntico do produto no catálogo.'
      };
    }
  }

  // 4. Item novo ou sem correspondência
  return {
    vinculado: false,
    produtoErpId: null,
    produtoErpNome: null,
    fatorConversao: 1.0,
    unidadeErp: null,
    unidadeFornecedor: unidadeFornecedor,
    confianca: 'PENDENTE',
    detalhes: 'Item novo ou ainda sem vínculo De-Para cadastrado no catálogo.'
  };
}

/**
 * Salva ou atualiza um vínculo De-Para de um produto de fornecedor
 * Utiliza UPSERT atômico para garantir integridade e idempotência
 */
export async function salvarOuAtualizarVinculoDePara({
  fornecedorId,
  codigoFornecedor,
  eanFornecedor = '',
  descricaoFornecedor,
  produtoErpId,
  fatorConversao = 1.0,
  unidadeFornecedor = 'UN'
}, db = dbModule) {
  if (!fornecedorId) throw new Error('O ID do fornecedor é obrigatório.');
  if (!codigoFornecedor) throw new Error('O código do fornecedor é obrigatório.');
  if (!produtoErpId) throw new Error('O produto do catálogo do ERP é obrigatório.');

  const fatorNum = parseFloat(fatorConversao) || 1.0;
  const descFinal = (descricaoFornecedor || 'PRODUTO FORNECEDOR').toUpperCase();
  const unFinal = (unidadeFornecedor || 'UN').toUpperCase();
  const eanFinal = (eanFornecedor || '').trim();

  const sql = `
    INSERT INTO fornecedores_produtos_vinculo (
      fornecedor_id, codigo_fornecedor, ean_fornecedor, descricao_fornecedor,
      produto_erp_id, fator_conversao, unidade_fornecedor, criado_em, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    ON CONFLICT(fornecedor_id, codigo_fornecedor) DO UPDATE SET
      ean_fornecedor = excluded.ean_fornecedor,
      descricao_fornecedor = excluded.descricao_fornecedor,
      produto_erp_id = excluded.produto_erp_id,
      fator_conversao = excluded.fator_conversao,
      unidade_fornecedor = excluded.unidade_fornecedor,
      atualizado_em = datetime('now', 'localtime');
  `;

  await db.run(sql, [
    fornecedorId,
    String(codigoFornecedor).trim(),
    eanFinal,
    descFinal,
    produtoErpId,
    fatorNum,
    unFinal
  ]);

  return await db.get(`
    SELECT * FROM fornecedores_produtos_vinculo 
    WHERE fornecedor_id = ? AND codigo_fornecedor = ?
  `, [fornecedorId, String(codigoFornecedor).trim()]);
}

/**
 * Processa uma lista de itens extraídos do XML enriquecendo-os com o motor De-Para
 * @param {Array} itensXml Lista de itens extraídos pelo parseXmlNfeCompleto
 * @param {number} fornecedorId ID do fornecedor no banco
 * @param {object} db Instância do banco de dados
 * @returns {Promise<object>} Resumo e lista enriquecida com status De-Para
 */
export async function processarItensXmlComDePara(itensXml, fornecedorId, db = dbModule) {
  if (!Array.isArray(itensXml)) return { itens: [], totalItens: 0, itensVinculados: 0, itensPendentes: 0, prontoParaEntrada: true };

  const itensEnriquecidos = [];
  let vinculados = 0;
  let pendentes = 0;

  for (const item of itensXml) {
    const dePara = await resolverDeParaItem(fornecedorId, item, db);
    const itemComDePara = {
      ...item,
      dePara,
      // Quantidade convertida que abastecerá o estoque físico
      quantidade_estoque: item.quantidade * (dePara.fatorConversao || 1.0),
      custo_unitario_convertido: (item.valor_unitario / (dePara.fatorConversao || 1.0))
    };

    if (dePara.vinculado) {
      vinculados++;
    } else {
      pendentes++;
    }

    itensEnriquecidos.push(itemComDePara);
  }

  return {
    itens: itensEnriquecidos,
    totalItens: itensEnriquecidos.length,
    itensVinculados: vinculados,
    itensPendentes: pendentes,
    prontoParaEntrada: pendentes === 0
  };
}
