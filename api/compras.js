/**
 * Vercel Serverless Function & API REST: /api/compras
 * Módulo de Entrada de Suprimentos, Compras e Gestão Inteligente De-Para (Ticket 3)
 * 
 * Endpoints Oficiais:
 * - POST /api/compras/importar-xml (ou acao: 'importar_xml' | 'analisar_xml')
 *   Parse da NF-e, bloqueio de chave duplicada e enriquecimento De-Para por auto-aprendizagem.
 * - POST /api/compras/confirmar-entrada (ou acao: 'confirmar_entrada' | 'confirmar_importacao')
 *   Entrada atômica: cadastro de fornecedor, memorização De-Para, movimentação de Kardex e Contas a Pagar.
 * - GET /api/compras/de-para/:fornecedorId (ou ?acao=de_para&fornecedorId=...)
 *   Consulta de histórico de vínculos de produtos daquele fornecedor.
 * - GET /api/compras
 *   Listagem de fornecedores e compras recentes.
 */

import { query, get, run, registrarLog } from '../lib/db.js';
import {
  parseXmlNfeCompleto,
  salvarOuAtualizarVinculoDePara,
  processarItensXmlComDePara
} from '../lib/compras_parser.js';

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
    const urlObj = new URL(req.url, 'http://localhost');
    const pathname = urlObj.pathname;
    const searchParams = urlObj.searchParams;
    const agora = new Date().toISOString();

    // =========================================================================
    // 1. ROTAS GET
    // =========================================================================
    if (req.method === 'GET') {
      // 1.1 Consulta De-Para por Fornecedor: /api/compras/de-para/:fornecedorId ou ?acao=de_para
      let fornecedorIdParaConsulta = null;
      if (pathname.startsWith('/api/compras/de-para/')) {
        const parts = pathname.replace('/api/compras/de-para/', '').split('/');
        fornecedorIdParaConsulta = parseInt(parts[0], 10);
      } else if (searchParams.get('acao') === 'de_para' || searchParams.get('fornecedor_id') || searchParams.get('fornecedorId')) {
        fornecedorIdParaConsulta = parseInt(searchParams.get('fornecedor_id') || searchParams.get('fornecedorId'), 10);
      }

      if (fornecedorIdParaConsulta) {
        const vinculos = await query(`
          SELECT 
            v.id,
            v.fornecedor_id,
            v.codigo_fornecedor,
            v.ean_fornecedor,
            v.descricao_fornecedor,
            v.produto_erp_id,
            v.fator_conversao,
            v.unidade_fornecedor,
            v.criado_em,
            v.atualizado_em,
            p.nome as produto_erp_nome,
            p.codigo_sku as produto_erp_sku,
            COALESCE(p.unidade_medida, 'UN') as produto_erp_unidade,
            p.preco_custo as produto_erp_custo,
            p.estoque_atual as produto_erp_estoque
          FROM fornecedores_produtos_vinculo v
          LEFT JOIN produtos p ON p.id = v.produto_erp_id
          WHERE v.fornecedor_id = ?
          ORDER BY v.descricao_fornecedor ASC
        `, [fornecedorIdParaConsulta]);

        return responder(res, 200, {
          success: true,
          fornecedor_id: fornecedorIdParaConsulta,
          total_vinculos: vinculos.length,
          vinculos
        });
      }

      // 1.2 Listagem Padrão de Fornecedores e Compras Importadas
      const fornecedores = await query('SELECT * FROM fornecedores WHERE ativo = 1 ORDER BY razao_social ASC');
      const compras = await query('SELECT id, chave_nfe, numero_nfe, serie_nfe, fornecedor_cnpj, fornecedor_nome, valor_total, data_emissao, data_importacao FROM compras_xml ORDER BY id DESC LIMIT 50');
      return responder(res, 200, { success: true, fornecedores, compras });
    }

    // =========================================================================
    // 2. ROTAS POST
    // =========================================================================
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const acao = body.acao || '';

      // -----------------------------------------------------------------------
      // 2.1 IMPORTAR / ANALISAR XML DE NF-e
      // Rota: POST /api/compras/importar-xml ou acao: 'importar_xml' | 'analisar_xml'
      // -----------------------------------------------------------------------
      const isImportarXml = pathname === '/api/compras/importar-xml' || acao === 'importar_xml' || acao === 'analisar_xml';

      if (isImportarXml) {
        const xmlConteudo = body.xml || body.xmlContent;
        if (!xmlConteudo) {
          return responder(res, 400, { error: 'O conteúdo do XML da NF-e não foi fornecido.' });
        }

        const dadosXml = parseXmlNfeCompleto(xmlConteudo);

        // Bloqueio de idempotência contra notas fiscais já importadas
        const notaExistente = await get('SELECT id, data_importacao FROM compras_xml WHERE chave_nfe = ?', [dadosXml.chave_nfe]);
        if (notaExistente) {
          return responder(res, 409, {
            error: `Esta Nota Fiscal (Chave ${dadosXml.chave_nfe}) já foi importada anteriormente em ${notaExistente.data_importacao}!`,
            ja_importada: true,
            chave_nfe: dadosXml.chave_nfe
          });
        }

        // Verifica se o emitente já é cadastrado como fornecedor
        const docFornecedor = dadosXml.fornecedor?.documento || '';
        let fornecedorCadastrado = null;
        if (docFornecedor) {
          fornecedorCadastrado = await get('SELECT id, razao_social, nome_fantasia FROM fornecedores WHERE cnpj = ?', [docFornecedor]);
        }

        // Enriquecimento inteligente de itens pelo motor De-Para
        const fornecedorId = fornecedorCadastrado ? fornecedorCadastrado.id : null;
        const processamentoItens = await processarItensXmlComDePara(dadosXml.itens, fornecedorId);

        // Catálogo de produtos para facilitar associação manual no modal
        const catalogo = await query(`
          SELECT id, codigo_sku, nome, ncm, COALESCE(unidade_medida, 'UN') as unidade_medida, preco_custo, estoque_atual 
          FROM produtos 
          WHERE ativo = 1 
          ORDER BY nome ASC
        `);

        return responder(res, 200, {
          success: true,
          ja_importada: false,
          chave_nfe: dadosXml.chave_nfe,
          numero_nfe: dadosXml.numero_nfe,
          serie_nfe: dadosXml.serie_nfe,
          modelo: dadosXml.modelo,
          natureza_operacao: dadosXml.natureza_operacao,
          data_emissao: dadosXml.data_emissao,
          valor_total: dadosXml.valor_total,
          fornecedor: dadosXml.fornecedor,
          fornecedor_id: fornecedorId,
          fornecedor_cadastrado: !!fornecedorCadastrado,
          destinatario: dadosXml.destinatario,
          totais: dadosXml.totais,
          duplicatas: dadosXml.duplicatas,
          itens: processamentoItens.itens,
          resumo_de_para: {
            total_itens: processamentoItens.totalItens,
            itens_vinculados: processamentoItens.itensVinculados,
            itens_pendentes: processamentoItens.itensPendentes,
            pronto_para_entrada: processamentoItens.prontoParaEntrada
          },
          catalogo_produtos: catalogo,
          informacoes_complementares: dadosXml.informacoes_complementares,
          // Mantém compatibilidade com payloads legados que esperavam { nota: ... }
          nota: {
            ...dadosXml,
            itens: processamentoItens.itens
          }
        });
      }

      // -----------------------------------------------------------------------
      // 2.2 CONFIRMAR ENTRADA DE COMPRA, KARDEX E CONTAS A PAGAR
      // Rota: POST /api/compras/confirmar-entrada ou acao: 'confirmar_entrada' | 'confirmar_importacao'
      // -----------------------------------------------------------------------
      const isConfirmarEntrada = pathname === '/api/compras/confirmar-entrada' || acao === 'confirmar_entrada' || acao === 'confirmar_importacao';

      if (isConfirmarEntrada) {
        const nota = body.nota || (body.xml ? parseXmlNfeCompleto(body.xml) : body);
        if (!nota || !nota.chave_nfe) {
          return responder(res, 400, { error: 'Dados da nota fiscal ou chave de acesso ausentes.' });
        }

        // Bloqueio de duplicidade preventiva
        const notaExistente = await get('SELECT id FROM compras_xml WHERE chave_nfe = ?', [nota.chave_nfe]);
        if (notaExistente) {
          return responder(res, 409, { error: `Esta Nota Fiscal (Chave ${nota.chave_nfe}) já foi importada anteriormente!` });
        }

        const lancarFinanceiro = body.lancar_financeiro !== false;
        const atualizarEstoque = body.atualizar_estoque !== false;
        const decisoesItens = body.decisoes_itens || body.itens || nota.itens || [];
        const operadorNome = body.operador_nome || 'Operador ERP';

        // A. Cadastra ou atualiza o Fornecedor (<emit>)
        const f = nota.fornecedor || {};
        const cnpjLimpo = (f.documento || f.cnpj || '').replace(/\D/g, '');
        let fornecedorId = body.fornecedor_id || null;

        if (cnpjLimpo && !fornecedorId) {
          const fornExistente = await get('SELECT id FROM fornecedores WHERE cnpj = ?', [cnpjLimpo]);
          if (fornExistente) {
            fornecedorId = fornExistente.id;
          } else {
            const endCompleto = [f.logradouro, f.numero, f.bairro].filter(Boolean).join(', ').toUpperCase();
            const resForn = await run(`
              INSERT INTO fornecedores (
                razao_social, nome_fantasia, cnpj, ie, telefone, endereco, cidade, uf, cep, ativo, data_cadastro
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            `, [
              (f.razao_social || 'FORNECEDOR NF-E').toUpperCase(),
              (f.nome_fantasia || f.razao_social || '').toUpperCase(),
              cnpjLimpo,
              f.ie || '',
              f.telefone || '',
              endCompleto,
              (f.cidade || '').toUpperCase(),
              (f.uf || 'RS').toUpperCase(),
              f.cep || '',
              agora
            ]);
            fornecedorId = resForn.lastInsertRowid;
          }
        }

        // B. Lança as duplicatas no Contas a Pagar (<cobr><dup>)
        let parcelasLancadas = 0;
        const duplicatas = nota.duplicatas || [];
        if (lancarFinanceiro && Array.isArray(duplicatas)) {
          for (const dup of duplicatas) {
            const valDup = parseFloat(dup.valor || 0);
            if (valDup <= 0) continue;
            await run(`
              INSERT INTO financeiro_lancamentos (
                tipo, origem, descricao, categoria, fornecedor_id, fornecedor_nome,
                chave_nfe_origem, valor, data_vencimento, forma_pagamento, status,
                observacoes, data_cadastro
              ) VALUES ('PAGAR', 'XML_COMPRA', ?, 'COMPRA DE MERCADORIA / INSUMO', ?, ?, ?, ?, ?, 'BOLETO', 'PENDENTE', ?, ?)
            `, [
              `NF-e #${nota.numero_nfe} (Parc. ${dup.numero}) - ${f.razao_social || 'FORNECEDOR'}`,
              fornecedorId,
              (f.razao_social || 'FORNECEDOR').toUpperCase(),
              nota.chave_nfe,
              valDup,
              dup.vencimento || nota.data_emissao,
              `Importado automaticamente via XML NF-e #${nota.numero_nfe}`,
              agora
            ]);
            parcelasLancadas++;
          }
        }

        // C. Processa Itens, Memoriza De-Para e Atualiza Kardex Físico
        let itensProcessados = 0;
        let itensSomadosEstoque = 0;
        let novosVinculosMemorizados = 0;

        for (let i = 0; i < decisoesItens.length; i++) {
          const dec = decisoesItens[i];
          const itemXml = (nota.itens && nota.itens[i]) || dec;
          itensProcessados++;

          // Identifica o ID do produto no ERP associado
          let prodId = dec.produto_erp_id || dec.produto_id || dec.dePara?.produtoErpId || null;
          const fatorConversao = parseFloat(dec.fator_conversao || dec.dePara?.fatorConversao || 1.0);
          const unidadeFornecedor = (itemXml.unidade || itemXml.uCom || 'UN').toUpperCase();

          // Criação rápida de novo produto caso solicitado pelo operador
          if (!prodId && dec.criar_novo_produto) {
            const skuNovo = (itemXml.codigo || `XML-${Date.now().toString().slice(-4)}`).toUpperCase();
            const descProduto = (itemXml.descricao || 'PRODUTO IMPORTADO XML').toUpperCase();
            const valorCustoUnit = parseFloat(itemXml.valor_unitario || 0) / fatorConversao;
            const resNovoProd = await run(`
              INSERT INTO produtos (
                codigo_sku, nome, categoria, unidade_medida, preco_custo, preco_venda, 
                estoque_atual, estoque_reservado, estoque_minimo, codigo_barras, ativo, data_cadastro
              ) VALUES (?, ?, 'MATERIAIS & SUPRIMENTOS', ?, ?, ?, 0, 0, 5, ?, 1, ?)
            `, [
              skuNovo,
              descProduto,
              (dec.unidade_erp || 'UN').toUpperCase(),
              valorCustoUnit,
              valorCustoUnit * 1.5,
              (itemXml.ean || '').trim(),
              agora
            ]);
            prodId = resNovoProd.lastInsertRowid;
          }

          // Se tiver produto ERP associado, memoriza o vínculo De-Para
          if (prodId && fornecedorId) {
            await salvarOuAtualizarVinculoDePara({
              fornecedorId,
              codigoFornecedor: itemXml.codigo || itemXml.cProd,
              eanFornecedor: itemXml.ean || itemXml.cEAN || '',
              descricaoFornecedor: itemXml.descricao || itemXml.xProd,
              produtoErpId: prodId,
              fatorConversao,
              unidadeFornecedor
            });
            novosVinculosMemorizados++;
          }

          // Atualização de Estoque Físico e Histórico no Kardex
          const deveMovimentarEstoque = atualizarEstoque && (dec.modo === 'B' || dec.acao_estoque === 'ESTOQUE_PRODUTO' || dec.movimentar_estoque !== false);

          if (deveMovimentarEstoque && prodId) {
            const prod = await get('SELECT id, nome, estoque_atual, preco_custo FROM produtos WHERE id = ?', [prodId]);
            if (prod) {
              const qtdXml = parseFloat(itemXml.quantidade || itemXml.qCom || 0);
              const qtdEntradaEstoque = qtdXml * fatorConversao;
              const custoEntradaUnitario = parseFloat(itemXml.valor_unitario || itemXml.vUnCom || 0) / fatorConversao;

              const saldoAnterior = Number(prod.estoque_atual || 0);
              const saldoPosterior = saldoAnterior + qtdEntradaEstoque;

              // Recálculo do Custo Médio Ponderado
              const custoMedio = saldoPosterior > 0
                ? (((saldoAnterior * Number(prod.preco_custo || 0)) + (qtdEntradaEstoque * custoEntradaUnitario)) / saldoPosterior)
                : custoEntradaUnitario;

              // Atualiza produto
              await run(`
                UPDATE produtos 
                SET estoque_atual = ?, preco_custo = ?, data_atualizacao = ? 
                WHERE id = ?
              `, [saldoPosterior, custoMedio, agora, prod.id]);

              // Registra movimentação no Kardex
              await run(`
                INSERT INTO estoque_movimentacoes (
                  produto_id, tipo, origem, motivo, quantidade,
                  saldo_anterior, saldo_posterior, custo_unitario,
                  documento_referencia, observacoes, operador_nome, data_movimentacao
                ) VALUES (?, 'ENTRADA', 'COMPRA', 'ENTRADA_XML_NF', ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
              `, [
                prod.id,
                qtdEntradaEstoque,
                saldoAnterior,
                saldoPosterior,
                custoEntradaUnitario,
                `NF-e #${nota.numero_nfe}`,
                `Entrada via NF-e ${nota.numero_nfe} | Fornecedor: ${f.razao_social || 'N/A'} (Fator: ${fatorConversao})`,
                operadorNome
              ]);

              itensSomadosEstoque++;
            }
          }
        }

        // D. Registra a NF-e importada em compras_xml
        await run(`
          INSERT INTO compras_xml (
            chave_nfe, numero_nfe, serie_nfe, fornecedor_id, fornecedor_cnpj,
            fornecedor_nome, valor_total, data_emissao, itens_json, xml_bruto, data_importacao
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          nota.chave_nfe,
          nota.numero_nfe,
          nota.serie_nfe || '1',
          fornecedorId,
          cnpjLimpo,
          (f.razao_social || '').toUpperCase(),
          parseFloat(nota.valor_total || 0),
          nota.data_emissao,
          JSON.stringify(decisoesItens),
          body.xml || null,
          agora
        ]);

        // E. Auditoria do Sistema
        await registrarLog({
          clienteId: fornecedorId,
          clienteNome: f.razao_social || 'FORNECEDOR XML',
          tipoAcao: 'IMPORTACAO_XML_COMPRA',
          camposAlterados: ['fornecedor', 'de_para', 'contas_pagar', 'kardex_estoque'],
          detalhes: `NF-e #${nota.numero_nfe} confirmada | ${parcelasLancadas} duplicata(s) lançada(s) | ${itensSomadosEstoque} item(ns) abastecido(s) no estoque | ${novosVinculosMemorizados} vínculo(s) De-Para memorizado(s)`,
          req
        }).catch(() => {});

        return responder(res, 201, {
          success: true,
          numero_nfe: nota.numero_nfe,
          chave_nfe: nota.chave_nfe,
          fornecedor_id: fornecedorId,
          parcelas_lancadas: parcelasLancadas,
          duplicatas_geradas: parcelasLancadas,
          itens_processados: itensProcessados,
          itens_somados_estoque: itensSomadosEstoque,
          vinculos_memorizados: novosVinculosMemorizados
        });
      }

      // -----------------------------------------------------------------------
      // 2.3 CADASTRO MANUAL DE FORNECEDOR
      // Rota: POST /api/compras com acao: 'salvar_fornecedor'
      // -----------------------------------------------------------------------
      if (acao === 'salvar_fornecedor') {
        const razao = (body.razao_social || '').trim().toUpperCase();
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
          (body.nome_fantasia || razao).toUpperCase(),
          cnpj || null,
          body.ie || '',
          body.telefone || '',
          body.email || '',
          (body.endereco || '').toUpperCase(),
          (body.cidade || '').toUpperCase(),
          (body.uf || 'RS').toUpperCase(),
          body.cep || '',
          (body.observacoes || '').toUpperCase(),
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
