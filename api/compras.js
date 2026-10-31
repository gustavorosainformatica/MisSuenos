/**
 * Vercel Serverless Function: /api/compras
 * Módulo de Fornecedores, Compras e Importação Híbrida de XML de NF-e (Ticket 5)
 * 
 * Suporta:
 * - Leitura e extração automática de XML de NF-e (Fornecedor <emit>, Duplicatas <dup>, Itens <det>)
 * - Bloqueio idempotente contra importação duplicada pela chave de 44 dígitos
 * - Escolha híbrida por item:
 *   Opção (A): Apenas lançar Fornecedor e Contas a Pagar (ignorar estoque de produtos acabados)
 *   Opção (B): Vincular item do XML a um produto do catálogo para somar estoque físico e atualizar custo
 */

import { query, get, run, registrarLog } from '../lib/db.js';

function responder(res, status, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(data);
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

/**
 * Extrai o conteúdo de uma tag XML simples
 */
function extrairTag(xml, tag) {
  if (!xml) return '';
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(regex);
  return m ? m[1].trim() : '';
}

/**
 * Faz o parse completo de um XML de NF-e (Modelo 55)
 */
function parseXmlNfe(xmlString) {
  if (!xmlString || !xmlString.includes('<infNFe')) {
    throw new Error('O arquivo enviado não é um XML válido de Nota Fiscal Eletrônica (NF-e).');
  }

  // Chave de acesso (44 dígitos)
  let chave = extrairTag(xmlString, 'chNFe');
  if (!chave) {
    const matchId = xmlString.match(/Id=["']NFe(\d{44})["']/i);
    if (matchId) chave = matchId[1];
  }
  if (!chave) {
    chave = 'NFE-' + Date.now();
  }

  const ideBloco = extrairTag(xmlString, 'ide');
  const numeroNfe = extrairTag(ideBloco, 'nNF') || 'S/N';
  const serieNfe = extrairTag(ideBloco, 'serie') || '1';
  const dhEmi = extrairTag(ideBloco, 'dhEmi') || extrairTag(ideBloco, 'dEmi') || new Date().toISOString();
  const dataEmissao = dhEmi.slice(0, 10);

  // Emitente (Fornecedor)
  const emitBloco = extrairTag(xmlString, 'emit');
  const enderEmit = extrairTag(emitBloco, 'enderEmit');
  const fornecedor = {
    cnpj: (extrairTag(emitBloco, 'CNPJ') || extrairTag(emitBloco, 'CPF')).replace(/\D/g, ''),
    razao_social: extrairTag(emitBloco, 'xNome') || 'Fornecedor XML',
    nome_fantasia: extrairTag(emitBloco, 'xFant') || extrairTag(emitBloco, 'xNome') || '',
    ie: extrairTag(emitBloco, 'IE') || '',
    logradouro: extrairTag(enderEmit, 'xLgr') || '',
    numero: extrairTag(enderEmit, 'nro') || '',
    bairro: extrairTag(enderEmit, 'xBairro') || '',
    cidade: extrairTag(enderEmit, 'xMun') || '',
    uf: extrairTag(enderEmit, 'UF') || 'RS',
    cep: extrairTag(enderEmit, 'CEP') || '',
    telefone: extrairTag(enderEmit, 'fone') || ''
  };

  // Totais
  const totalBloco = extrairTag(xmlString, 'ICMSTot');
  const valorTotal = parseFloat(extrairTag(totalBloco, 'vNF') || extrairTag(totalBloco, 'vProd') || 0);

  // Duplicatas / Parcelas (<cobr><dup>)
  const cobrBloco = extrairTag(xmlString, 'cobr');
  const duplicatas = [];
  if (cobrBloco) {
    const regexDup = /<dup[^>]*>([\s\S]*?)<\/dup>/gi;
    let mDup;
    while ((mDup = regexDup.exec(cobrBloco)) !== null) {
      const dupXml = mDup[1];
      duplicatas.push({
        numero: extrairTag(dupXml, 'nDup') || String(duplicatas.length + 1),
        vencimento: extrairTag(dupXml, 'dVenc') || dataEmissao,
        valor: parseFloat(extrairTag(dupXml, 'vDup') || 0)
      });
    }
  }
  if (duplicatas.length === 0 && valorTotal > 0) {
    duplicatas.push({
      numero: '001',
      vencimento: dataEmissao,
      valor: valorTotal
    });
  }

  // Itens da Nota (<det>)
  const itens = [];
  const regexDet = /<det[^>]*>([\s\S]*?)<\/det>/gi;
  let mDet;
  while ((mDet = regexDet.exec(xmlString)) !== null) {
    const prodXml = extrairTag(mDet[1], 'prod');
    if (!prodXml) continue;
    itens.push({
      codigo: extrairTag(prodXml, 'cProd'),
      descricao: extrairTag(prodXml, 'xProd'),
      ncm: extrairTag(prodXml, 'NCM'),
      cfop: extrairTag(prodXml, 'CFOP'),
      unidade: extrairTag(prodXml, 'uCom') || 'UN',
      quantidade: parseFloat(extrairTag(prodXml, 'qCom') || 1),
      valor_unitario: parseFloat(extrairTag(prodXml, 'vUnCom') || 0),
      valor_total: parseFloat(extrairTag(prodXml, 'vProd') || 0)
    });
  }

  return {
    chave_nfe: chave,
    numero_nfe: numeroNfe,
    serie_nfe: serieNfe,
    data_emissao: dataEmissao,
    valor_total: valorTotal,
    fornecedor,
    duplicatas,
    itens
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return res.status(204).end();
    }
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  try {
    // 1. GET: Listar Fornecedores e Histórico de XMLs Importados
    if (req.method === 'GET') {
      const fornecedores = await query('SELECT * FROM fornecedores WHERE ativo = 1 ORDER BY razao_social ASC');
      const compras = await query('SELECT id, chave_nfe, numero_nfe, serie_nfe, fornecedor_cnpj, fornecedor_nome, valor_total, data_emissao, data_importacao FROM compras_xml ORDER BY id DESC LIMIT 50');
      return responder(res, 200, { success: true, fornecedores, compras });
    }

    // 2. POST: Analisar XML, Confirmar Importação Híbrida (A/B) ou Cadastrar Fornecedor
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const acao = body.acao || 'analisar_xml';
      const agora = new Date().toISOString();

      // 2.1. Analisar XML (Pré-visualização antes de gravar)
      if (acao === 'analisar_xml') {
        const dadosXml = parseXmlNfe(body.xml);
        const jaExiste = await get('SELECT id, data_importacao FROM compras_xml WHERE chave_nfe = ?', [dadosXml.chave_nfe]);
        const catalogo = await query('SELECT id, codigo_sku, nome, ncm, unidade_medida, preco_custo, estoque_atual FROM produtos WHERE ativo = 1 ORDER BY nome ASC');

        // Tenta sugerir vínculo automático por NCM ou nome parecido
        const itensComSugestao = dadosXml.itens.map((it, idx) => {
          const matchProd = catalogo.find(p =>
            (p.codigo_sku && p.codigo_sku.toUpperCase() === it.codigo.toUpperCase()) ||
            (p.nome && it.descricao && p.nome.toUpperCase() === it.descricao.toUpperCase())
          );
          return {
            ...it,
            numero_item: idx + 1,
            codigo_fornecedor: it.codigo,
            nome: it.descricao,
            index: idx,
            modo_sugerido: matchProd ? 'B' : 'A', // A = Apenas Despesa, B = Somar Estoque
            produto_id_sugerido: matchProd ? matchProd.id : '',
            produto_sugerido: matchProd || null
          };
        });

        if (jaExiste) {
          return responder(res, 409, {
            error: `Esta Nota Fiscal (Chave ${dadosXml.chave_nfe}) já foi importada anteriormente em ${jaExiste.data_importacao}!`,
            ja_importada: true,
            chave_nfe: dadosXml.chave_nfe
          });
        }

        return responder(res, 200, {
          success: true,
          ja_importada: false,
          ...dadosXml,
          itens: itensComSugestao,
          nota: {
            ...dadosXml,
            itens: itensComSugestao
          },
          catalogo_produtos: catalogo
        });
      }

      // 2.2. Confirmar Importação do XML (Cadastra Fornecedor + Contas a Pagar + Opção A ou B por item)
      if (acao === 'confirmar_importacao') {
        const { decisoes_itens, lancar_financeiro = true } = body;
        const nota = body.nota || (body.xml ? parseXmlNfe(body.xml) : null);
        if (!nota || !nota.chave_nfe) {
          return responder(res, 400, { error: 'Dados da nota fiscal inválidos.' });
        }

        // Proteção de idempotência contra importação duplicada
        const duplicada = await get('SELECT id FROM compras_xml WHERE chave_nfe = ?', [nota.chave_nfe]);
        if (duplicada) {
          return responder(res, 409, { error: `Esta Nota Fiscal (Chave ${nota.chave_nfe}) já foi importada anteriormente!` });
        }

        // A. Cadastra ou atualiza o Fornecedor (<emit>)
        const f = nota.fornecedor || {};
        const cnpjLimpo = (f.cnpj || '').replace(/\D/g, '');
        let fornecedorId = null;

        if (cnpjLimpo) {
          const fornExistente = await get('SELECT id FROM fornecedores WHERE cnpj = ?', [cnpjLimpo]);
          if (fornExistente) {
            fornecedorId = fornExistente.id;
          } else {
            const endCompleto = [f.logradouro, f.numero, f.bairro].filter(Boolean).join(', ');
            const resForn = await run(`
              INSERT INTO fornecedores (
                razao_social, nome_fantasia, cnpj, ie, telefone, endereco, cidade, uf, cep, ativo, data_cadastro
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            `, [
              f.razao_social || 'Fornecedor NF-e',
              f.nome_fantasia || f.razao_social || '',
              cnpjLimpo,
              f.ie || '',
              f.telefone || '',
              endCompleto,
              f.cidade || '',
              f.uf || 'RS',
              f.cep || '',
              agora
            ]);
            fornecedorId = resForn.lastInsertRowid;
          }
        }

        // B. Lança as duplicatas no Contas a Pagar (<dup>)
        let parcelasLancadas = 0;
        if (lancar_financeiro && Array.isArray(nota.duplicatas)) {
          for (const dup of nota.duplicatas) {
            const valDup = parseFloat(dup.valor || 0);
            if (valDup <= 0) continue;
            await run(`
              INSERT INTO financeiro_lancamentos (
                tipo, origem, descricao, categoria, fornecedor_id, fornecedor_nome,
                chave_nfe_origem, valor, data_vencimento, forma_pagamento, status,
                observacoes, data_cadastro
              ) VALUES ('PAGAR', 'XML_COMPRA', ?, 'Compra de Mercadoria / Insumo', ?, ?, ?, ?, ?, 'BOLETO', 'PENDENTE', ?, ?)
            `, [
              `NF-e #${nota.numero_nfe} (Parc. ${dup.numero}) - ${f.razao_social}`,
              fornecedorId,
              f.razao_social || 'Fornecedor',
              nota.chave_nfe,
              valDup,
              dup.vencimento || nota.data_emissao,
              `Importado automaticamente via XML NF-e ${nota.numero_nfe}`,
              agora
            ]);
            parcelasLancadas++;
          }
        }

        // C. Processa Itens segundo a decisão híbrida do operador: Opção (A) ou Opção (B)
        let itensSomadosEstoque = 0;
        if (Array.isArray(decisoes_itens)) {
          for (let i = 0; i < decisoes_itens.length; i++) {
            const dec = decisoes_itens[i];
            const itemXml = (nota.itens && nota.itens[i]) || {};
            const isOpcaoB = dec.modo === 'B' || dec.acao_estoque === 'ESTOQUE_PRODUTO';

            if (isOpcaoB && dec.criar_novo_produto) {
              const skuNovo = itemXml.codigo || `XML-${Date.now().toString().slice(-4)}`;
              await run(
                `INSERT INTO produtos (codigo_sku, ncm, nome, categoria, unidade_medida, preco_custo, preco_venda, estoque_atual, estoque_reservado, estoque_minimo, ativo, data_cadastro)
                 VALUES (?, ?, ?, 'Couros & Peles', ?, ?, ?, ?, 0, 5, 1, ?)`,
                [
                  skuNovo,
                  (itemXml.ncm || '42050000').replace(/\D/g, ''),
                  itemXml.descricao || 'Produto Importado XML',
                  itemXml.unidade || 'UN',
                  parseFloat(itemXml.valor_unitario || 0),
                  parseFloat(itemXml.valor_unitario || 0) * 1.5,
                  parseFloat(itemXml.quantidade || 1),
                  agora
                ]
              );
              itensSomadosEstoque++;
            } else if (isOpcaoB && dec.produto_id) {
              const prod = await get('SELECT id, estoque_atual, preco_custo FROM produtos WHERE id = ?', [dec.produto_id]);
              if (prod) {
                const qtdSomar = parseFloat(dec.quantidade_estoque || dec.quantidade || itemXml.quantidade || 0);
                const novoEstoque = parseFloat(prod.estoque_atual || 0) + qtdSomar;
                const novoCusto = parseFloat(dec.novo_custo || dec.valor_unitario || itemXml.valor_unitario || prod.preco_custo || 0);

                await run(
                  'UPDATE produtos SET estoque_atual = ?, preco_custo = ?, data_atualizacao = ? WHERE id = ?',
                  [novoEstoque, novoCusto, agora, prod.id]
                );
                itensSomadosEstoque++;
              }
            }
          }
        }

        // D. Registra o XML importado
        await run(`
          INSERT INTO compras_xml (
            chave_nfe, numero_nfe, serie_nfe, fornecedor_id, fornecedor_cnpj,
            fornecedor_nome, valor_total, data_emissao, itens_json, data_importacao
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          nota.chave_nfe,
          nota.numero_nfe,
          nota.serie_nfe,
          fornecedorId,
          cnpjLimpo,
          f.razao_social || '',
          parseFloat(nota.valor_total || 0),
          nota.data_emissao,
          JSON.stringify(decisoes_itens || nota.itens || []),
          agora
        ]);

        await registrarLog({
          clienteId: fornecedorId,
          clienteNome: f.razao_social || 'Fornecedor XML',
          tipoAcao: 'IMPORTACAO_XML_COMPRA',
          camposAlterados: ['fornecedor', 'contas_pagar', 'estoque'],
          detalhes: `NF-e #${nota.numero_nfe} importada | ${parcelasLancadas} parcela(s) lançadas | ${itensSomadosEstoque} item(ns) somados ao estoque`,
          req
        }).catch(() => {});

        return responder(res, 201, {
          success: true,
          numero_nfe: nota.numero_nfe,
          chave_nfe: nota.chave_nfe,
          fornecedor_id: fornecedorId,
          parcelas_lancadas: parcelasLancadas,
          duplicatas_geradas: parcelasLancadas,
          itens_somados_estoque: itensSomadosEstoque
        });
      }

      // 2.3. Cadastro manual de Fornecedor
      if (acao === 'salvar_fornecedor') {
        const razao = (body.razao_social || '').trim();
        if (!razao) {
          return responder(res, 400, { error: 'Razão social do fornecedor é obrigatória.' });
        }
        const cnpj = (body.cnpj || '').replace(/\D/g, '');
        const info = await run(`
          INSERT INTO fornecedores (
            razao_social, nome_fantasia, cnpj, ie, telefone, email, endereco, cidade, uf, cep, observacoes, ativo, data_cadastro
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `, [
          razao,
          body.nome_fantasia || razao,
          cnpj || null,
          body.ie || '',
          body.telefone || '',
          body.email || '',
          body.endereco || '',
          body.cidade || '',
          (body.uf || 'RS').toUpperCase(),
          body.cep || '',
          body.observacoes || '',
          agora
        ]);

        return responder(res, 201, { success: true, id: info.lastInsertRowid, razao_social: razao });
      }
    }

    return responder(res, 405, { error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO /api/compras]', err);
    return responder(res, 400, { error: err.message });
  }
}
