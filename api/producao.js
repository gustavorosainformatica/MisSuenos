/**
 * Vercel Serverless Function: /api/producao
 * Gerenciamento de Ficha Técnica (BOM), Ordens de Produção Artesanal e Estorno no Kardex
 * Autor: Gustavo Rosa Informática
 * Ambiente: SQLite Local / Turso Cloud
 */

import { query, get, run, execute, registrarLog } from '../lib/db.js';
import { alocarLotesPeps, gerarNumeroLotePreventivo } from '../lib/calculos_erp.js';

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

function parseUrl(req) {
  return new URL(req.url, 'http://localhost');
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
 * Calcula o próximo número de ordem de produção (#OP-0001) com blindagem UNIQUE preventiva
 */
async function gerarProximoNumeroOrdem() {
  const ordens = await query("SELECT numero FROM producao_ordens WHERE numero IS NOT NULL");
  let maiorNumero = 0;
  for (const o of ordens) {
    if (o.numero) {
      const match = o.numero.match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maiorNumero) {
          maiorNumero = num;
        }
      }
    }
  }

  let proximo = maiorNumero + 1;
  let candidato = `#OP-${String(proximo).padStart(4, '0')}`;

  // Dupla verificação no banco
  while (true) {
    const existe = await get("SELECT id FROM producao_ordens WHERE numero = ?", [candidato]);
    if (!existe) break;
    proximo++;
    candidato = `#OP-${String(proximo).padStart(4, '0')}`;
  }

  return candidato;
}

export default async function handler(req, res) {
  // CORS Preflight
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

  const url = parseUrl(req);
  const pathname = url.pathname;

  try {
    // =========================================================================
    // 1. CONFIGURAÇÃO DE POLÍTICA DE ESTOQUE
    // =========================================================================
    if (pathname === '/api/producao/config') {
      if (req.method === 'GET') {
        const row = await get("SELECT valor FROM configuracoes_sistema WHERE chave = 'producao_permitir_saldo_negativo'");
        const permitir = row ? String(row.valor) === '1' : false;
        return responder(res, 200, { producao_permitir_saldo_negativo: permitir });
      }

      if (req.method === 'POST' || req.method === 'PUT') {
        const body = await parseBody(req);
        const valorStr = (body.producao_permitir_saldo_negativo === true || body.producao_permitir_saldo_negativo === '1' || body.producao_permitir_saldo_negativo === 1) ? '1' : '0';
        
        await run(`
          INSERT INTO configuracoes_sistema (chave, valor, data_atualizacao)
          VALUES ('producao_permitir_saldo_negativo', ?, datetime('now', 'localtime'))
          ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, data_atualizacao = excluded.data_atualizacao
        `, [valorStr]);

        return responder(res, 200, {
          success: true,
          producao_permitir_saldo_negativo: valorStr === '1',
          mensagem: `Política de estoque atualizada para: ${valorStr === '1' ? 'Permitir saldo negativo com alerta' : 'Bloqueio estrito'}`
        });
      }
    }

    // =========================================================================
    // 2. FICHA TÉCNICA (BOM) DO PRODUTO (/api/produtos/:id/bom ou /api/producao/bom/:id)
    // =========================================================================
    const matchProdBom = pathname.match(/^\/api\/(?:produtos|producao\/bom)\/(\d+)(?:\/bom)?$/);
    if (matchProdBom) {
      const produtoPaiId = parseInt(matchProdBom[1], 10);
      const produtoPai = await get("SELECT * FROM produtos WHERE id = ?", [produtoPaiId]);
      if (!produtoPai) {
        return responder(res, 404, { error: 'Produto pai não encontrado.' });
      }

      if (req.method === 'GET') {
        const itens = await query(`
          SELECT 
            b.id,
            b.produto_filho_id,
            p.codigo_sku,
            p.nome,
            p.categoria,
            p.unidade_medida,
            p.preco_custo,
            p.estoque_atual,
            b.quantidade,
            b.observacoes
          FROM produtos_bom b
          JOIN produtos p ON p.id = b.produto_filho_id
          WHERE b.produto_pai_id = ?
          ORDER BY p.nome ASC
        `, [produtoPaiId]);

        let custoInsumosTotal = 0;
        for (const item of itens) {
          custoInsumosTotal += (parseFloat(item.quantidade) || 0) * (parseFloat(item.preco_custo) || 0);
        }

        const custoAdicional = parseFloat(produtoPai.custo_adicional_producao) || 0;
        const custoEstimadoTotal = custoInsumosTotal + custoAdicional;

        return responder(res, 200, {
          produto_id: produtoPaiId,
          nome: produtoPai.nome,
          codigo_sku: produtoPai.codigo_sku,
          preco_custo_atual: produtoPai.preco_custo || 0,
          custo_adicional_producao: custoAdicional,
          custo_insumos_total: custoInsumosTotal,
          custo_producao_estimado: custoEstimadoTotal,
          tipo_item: produtoPai.tipo_item || 'SIMPLES',
          itens
        });
      }

      if (req.method === 'POST' || req.method === 'PUT') {
        const body = await parseBody(req);
        const itens = Array.isArray(body.itens) ? body.itens : [];

        // Validação: Prevenção de loop (produto filho ser ele mesmo) e quantidade positiva
        for (const item of itens) {
          const filhoId = parseInt(item.produto_filho_id, 10);
          const qtd = parseFloat(item.quantidade);
          if (filhoId === produtoPaiId) {
            return responder(res, 400, { error: 'Um produto não pode ser insumo de si próprio (referência circular).' });
          }
          if (isNaN(qtd) || qtd <= 0) {
            return responder(res, 400, { error: 'Quantidade de cada insumo deve ser maior que zero.' });
          }
        }

        // Atualização atômica da Ficha Técnica
        await run("DELETE FROM produtos_bom WHERE produto_pai_id = ?", [produtoPaiId]);

        let custoInsumosTotal = 0;
        for (const item of itens) {
          const filhoId = parseInt(item.produto_filho_id, 10);
          const qtd = parseFloat(item.quantidade);
          const obs = item.observacoes ? String(item.observacoes).trim() : null;

          await run(`
            INSERT INTO produtos_bom (produto_pai_id, produto_filho_id, quantidade, observacoes, data_cadastro)
            VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
          `, [produtoPaiId, filhoId, qtd, obs]);

          const filho = await get("SELECT preco_custo FROM produtos WHERE id = ?", [filhoId]);
          if (filho) {
            custoInsumosTotal += qtd * (parseFloat(filho.preco_custo) || 0);
          }
        }

        // Atualiza custo adicional e tipo do produto pai se fornecido
        let novoCustoAdicional = produtoPai.custo_adicional_producao || 0;
        if (body.custo_adicional_producao !== undefined && body.custo_adicional_producao !== null && String(body.custo_adicional_producao).trim() !== '') {
          novoCustoAdicional = Math.max(0, parseFloat(body.custo_adicional_producao));
        }

        const novoTipoItem = itens.length > 0 ? 'FABRICADO' : (produtoPai.tipo_item || 'SIMPLES');
        const custoProducaoEstimado = custoInsumosTotal + novoCustoAdicional;

        await run(`
          UPDATE produtos 
          SET custo_adicional_producao = ?, tipo_item = ?, data_atualizacao = datetime('now', 'localtime')
          WHERE id = ?
        `, [novoCustoAdicional, novoTipoItem, produtoPaiId]);

        await registrarLog({
          clienteId: null,
          clienteNome: 'PCP / Produção',
          tipoAcao: 'ATUALIZAR_BOM',
          camposAlterados: ['produtos_bom', 'custo_adicional_producao'],
          detalhes: `Ficha Técnica (BOM) do produto #${produtoPaiId} (${produtoPai.nome}) atualizada com ${itens.length} insumos. Custo estimado: R$ ${custoProducaoEstimado.toFixed(2)}`,
          req
        }).catch(() => {});

        return responder(res, 200, {
          success: true,
          produto_id: produtoPaiId,
          total_itens: itens.length,
          custo_insumos_total: custoInsumosTotal,
          custo_adicional_producao: novoCustoAdicional,
          custo_producao_estimado: custoProducaoEstimado
        });
      }
    }

    // =========================================================================
    // 3. ESTORNO DE ORDEM DE PRODUÇÃO (/api/producao/ordens/:id/estornar)
    // =========================================================================
    const matchEstorno = pathname.match(/^\/api\/producao\/ordens\/(\d+)\/estornar$/);
    if (matchEstorno && req.method === 'POST') {
      const ordemId = parseInt(matchEstorno[1], 10);
      const ordem = await get("SELECT * FROM producao_ordens WHERE id = ?", [ordemId]);
      if (!ordem) {
        return responder(res, 404, { error: 'Ordem de produção não encontrada.' });
      }

      if (ordem.status !== 'CONCLUIDA') {
        return responder(res, 400, { error: `Ordem de produção já está com status ${ordem.status}. Apenas ordens CONCLUÍDAS podem ser estornadas.` });
      }

      const body = await parseBody(req);
      const motivoEstorno = body.motivo ? String(body.motivo).trim() : 'Estorno operacional de montagem';

      // 1. Snapshot dos insumos consumidos
      let itensConsumidos = [];
      try {
        if (ordem.itens_consumidos) {
          itensConsumidos = JSON.parse(ordem.itens_consumidos);
        }
      } catch {}

      if (!itensConsumidos || itensConsumidos.length === 0) {
        // Fallback: se o snapshot não estava gravado, busca na BOM atual
        const bomItens = await query(`
          SELECT b.produto_filho_id, b.quantidade, p.preco_custo, p.nome
          FROM produtos_bom b
          JOIN produtos p ON p.id = b.produto_filho_id
          WHERE b.produto_pai_id = ?
        `, [ordem.produto_id]);
        itensConsumidos = bomItens.map(b => ({
          produto_filho_id: b.produto_filho_id,
          nome: b.nome,
          quantidade_unitaria: b.quantidade,
          quantidade_total: b.quantidade * ordem.quantidade,
          preco_custo: b.preco_custo
        }));
      }

      // 2. Reverter insumos no Kardex (ENTRADA no insumo)
      for (const insumo of itensConsumidos) {
        const prodInsumo = await get("SELECT estoque_atual FROM produtos WHERE id = ?", [insumo.produto_filho_id]);
        const saldoAnterior = prodInsumo ? parseFloat(prodInsumo.estoque_atual || 0) : 0;
        const qtdDevolver = parseFloat(insumo.quantidade_total || (insumo.quantidade_unitaria * ordem.quantidade) || 0);
        const saldoPosterior = saldoAnterior + qtdDevolver;

        await run("UPDATE produtos SET estoque_atual = ?, data_atualizacao = datetime('now', 'localtime') WHERE id = ?", [saldoPosterior, insumo.produto_filho_id]);

        // Reverter lotes dos insumos se existirem
        let loteRefId = null;
        let loteRefNum = null;
        if (Array.isArray(insumo.lotes_alocados)) {
          for (const aloc of insumo.lotes_alocados) {
            if (aloc.lote_id && aloc.quantidade > 0) {
              await run(`
                UPDATE produtos_lotes 
                SET quantidade_atual = quantidade_atual + ?, status = 'ATIVO'
                WHERE id = ?
              `, [aloc.quantidade, aloc.lote_id]);
            }
          }
          loteRefId = insumo.lotes_alocados[0]?.lote_id || null;
          loteRefNum = insumo.lotes_alocados.map(a => a.numero_lote).join(', ');
        }

        await run(`
          INSERT INTO estoque_movimentacoes (
            produto_id, tipo, origem, motivo, quantidade,
            saldo_anterior, saldo_posterior, custo_unitario,
            documento_referencia, lote_id, numero_lote,
            observacoes, operador_nome, data_movimentacao
          ) VALUES (?, 'ENTRADA', 'PRODUCAO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        `, [
          insumo.produto_filho_id,
          `ESTORNO DE PRODUÇÃO ${ordem.numero}`,
          qtdDevolver,
          saldoAnterior,
          saldoPosterior,
          parseFloat(insumo.preco_custo || 0),
          `ESTORNO-${ordem.numero}`,
          loteRefId,
          loteRefNum,
          `Devolução de insumo por estorno da ordem ${ordem.numero}. Motivo: ${motivoEstorno}${loteRefNum ? ` (Lotes: ${loteRefNum})` : ''}`,
          body.operador_nome || 'SISTEMA'
        ]);
      }

      // 3. Reverter produto acabado no Kardex (SAIDA no acabado)
      const prodAcabado = await get("SELECT estoque_atual FROM produtos WHERE id = ?", [ordem.produto_id]);
      const saldoAcabadoAnterior = prodAcabado ? parseFloat(prodAcabado.estoque_atual || 0) : 0;
      const saldoAcabadoPosterior = Math.max(0, saldoAcabadoAnterior - ordem.quantidade);

      await run("UPDATE produtos SET estoque_atual = ?, data_atualizacao = datetime('now', 'localtime') WHERE id = ?", [saldoAcabadoPosterior, ordem.produto_id]);

      // Se gerou lote de produto acabado, abater ou marcar esgotado
      const loteAcabado = await get("SELECT id, quantidade_atual, numero_lote FROM produtos_lotes WHERE produto_id = ? AND observacoes LIKE ?", [ordem.produto_id, `%${ordem.numero}%`]);
      let loteAcabadoId = null;
      let loteAcabadoNum = null;
      if (loteAcabado) {
        loteAcabadoId = loteAcabado.id;
        loteAcabadoNum = loteAcabado.numero_lote;
        const novoSaldoLote = Math.max(0, parseFloat(loteAcabado.quantidade_atual || 0) - ordem.quantidade);
        await run("UPDATE produtos_lotes SET quantidade_atual = ?, status = CASE WHEN ? = 0 THEN 'ESGOTADO' ELSE status END WHERE id = ?", [novoSaldoLote, novoSaldoLote, loteAcabado.id]);
      }

      await run(`
        INSERT INTO estoque_movimentacoes (
          produto_id, tipo, origem, motivo, quantidade,
          saldo_anterior, saldo_posterior, custo_unitario,
          documento_referencia, lote_id, numero_lote,
          observacoes, operador_nome, data_movimentacao
        ) VALUES (?, 'SAIDA', 'PRODUCAO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      `, [
        ordem.produto_id,
        `ESTORNO DE PRODUÇÃO ${ordem.numero}`,
        ordem.quantidade,
        saldoAcabadoAnterior,
        saldoAcabadoPosterior,
        parseFloat(ordem.custo_unitario_final || 0),
        `ESTORNO-${ordem.numero}`,
        loteAcabadoId,
        loteAcabadoNum,
        `Estorno de produto acabado da ordem ${ordem.numero}. Motivo: ${motivoEstorno}${loteAcabadoNum ? ` (Lote: ${loteAcabadoNum})` : ''}`,
        body.operador_nome || 'SISTEMA'
      ]);

      // 4. Atualizar Ordem de Produção
      await run(`
        UPDATE producao_ordens 
        SET status = 'ESTORNADA', data_estorno = datetime('now', 'localtime'), motivo_estorno = ?
        WHERE id = ?
      `, [motivoEstorno, ordemId]);

      await registrarLog({
        clienteId: null,
        clienteNome: 'PCP / Produção',
        tipoAcao: 'ESTORNO_PRODUCAO',
        camposAlterados: ['status', 'data_estorno', 'motivo_estorno'],
        detalhes: `Ordem de produção ${ordem.numero} estornada. ${ordem.quantidade} produtos acabados estornados e insumos devolvidos.`,
        req
      }).catch(() => {});

      return responder(res, 200, {
        success: true,
        mensagem: `Ordem de produção ${ordem.numero} estornada com sucesso.`,
        ordem_id: ordemId,
        numero: ordem.numero
      });
    }

    // =========================================================================
    // 4. ORDENS DE PRODUÇÃO (/api/producao/ordens)
    // =========================================================================
    if (pathname === '/api/producao/ordens' || pathname === '/api/producao') {
      if (req.method === 'GET') {
        const status = url.searchParams.get('status');
        const produtoId = url.searchParams.get('produto_id');

        let sql = `
          SELECT 
            o.*,
            p.nome as produto_nome,
            p.codigo_sku as produto_sku,
            p.unidade_medida as produto_unidade
          FROM producao_ordens o
          JOIN produtos p ON p.id = o.produto_id
          WHERE 1=1
        `;
        const params = [];

        if (status) {
          sql += ' AND o.status = ?';
          params.push(status.toUpperCase().trim());
        }
        if (produtoId) {
          sql += ' AND o.produto_id = ?';
          params.push(parseInt(produtoId, 10));
        }

        sql += ' ORDER BY o.id DESC';

        const ordens = await query(sql, params);
        return responder(res, 200, ordens);
      }

      if (req.method === 'POST') {
        const body = await parseBody(req);
        const produtoId = parseInt(body.produto_id, 10);
        const qtdProduzir = parseFloat(body.quantidade);

        if (!produtoId || isNaN(produtoId)) {
          return responder(res, 400, { error: 'O produto_id é obrigatório.' });
        }
        if (isNaN(qtdProduzir) || qtdProduzir <= 0) {
          return responder(res, 400, { error: 'A quantidade a produzir deve ser maior que zero.' });
        }

        const produto = await get("SELECT * FROM produtos WHERE id = ?", [produtoId]);
        if (!produto) {
          return responder(res, 404, { error: 'Produto acabado não encontrado.' });
        }

        // Buscar Ficha Técnica (BOM)
        const insumosBom = await query(`
          SELECT 
            b.produto_filho_id,
            b.quantidade,
            p.nome,
            p.codigo_sku,
            p.unidade_medida,
            p.preco_custo,
            p.estoque_atual
          FROM produtos_bom b
          JOIN produtos p ON p.id = b.produto_filho_id
          WHERE b.produto_pai_id = ?
        `, [produtoId]);

        if (insumosBom.length === 0) {
          return responder(res, 400, { error: 'Este produto não possui Ficha Técnica (BOM) cadastrada com insumos.' });
        }

        // Verificar política de saldo negativo
        const rowConfig = await get("SELECT valor FROM configuracoes_sistema WHERE chave = 'producao_permitir_saldo_negativo'");
        const permitirSaldoNegativo = rowConfig ? String(rowConfig.valor) === '1' : false;

        // Validar saldo de insumos
        const itensFaltantes = [];
        let custoInsumosTotal = 0;
        const snapshotItensConsumidos = [];

        for (const item of insumosBom) {
          const qtdNecessaria = parseFloat(item.quantidade) * qtdProduzir;
          const estoqueAtual = parseFloat(item.estoque_atual || 0);
          const custoUnit = parseFloat(item.preco_custo || 0);
          custoInsumosTotal += qtdNecessaria * custoUnit;

          snapshotItensConsumidos.push({
            produto_filho_id: item.produto_filho_id,
            nome: item.nome,
            codigo_sku: item.codigo_sku,
            unidade_medida: item.unidade_medida,
            quantidade_unitaria: parseFloat(item.quantidade),
            quantidade_total: qtdNecessaria,
            preco_custo: custoUnit
          });

          if (estoqueAtual < qtdNecessaria) {
            itensFaltantes.push({
              insumo_id: item.produto_filho_id,
              nome: item.nome,
              codigo_sku: item.codigo_sku,
              estoque_atual: estoqueAtual,
              necessario: qtdNecessaria,
              falta: qtdNecessaria - estoqueAtual
            });
          }
        }

        if (itensFaltantes.length > 0 && !permitirSaldoNegativo) {
          return responder(res, 400, {
            error: 'ESTOQUE_INSUFICIENTE',
            mensagem: 'Saldo de insumos insuficiente para a quantidade solicitada.',
            itens_faltantes: itensFaltantes
          });
        }

        // Blindagem preventiva do número da ordem
        const numeroOrdem = await gerarProximoNumeroOrdem();
        const custoAdicionalUnit = parseFloat(produto.custo_adicional_producao || 0);
        const custoAdicionalTotal = custoAdicionalUnit * qtdProduzir;
        const custoTotalOrdem = custoInsumosTotal + custoAdicionalTotal;
        const custoUnitarioFinal = custoTotalOrdem / qtdProduzir;

        // 1. Baixar insumos no Kardex (SAIDA)
        for (const item of snapshotItensConsumidos) {
          const prodInsumo = await get("SELECT estoque_atual, controla_lote FROM produtos WHERE id = ?", [item.produto_filho_id]);
          const saldoAnterior = prodInsumo ? parseFloat(prodInsumo.estoque_atual || 0) : 0;
          const saldoPosterior = saldoAnterior - item.quantidade_total;

          await run("UPDATE produtos SET estoque_atual = ?, data_atualizacao = datetime('now', 'localtime') WHERE id = ?", [saldoPosterior, item.produto_filho_id]);

          // Se o insumo controla lote, alocar via PEPS e abater dos lotes
          let alocacoesLote = [];
          if (prodInsumo && prodInsumo.controla_lote === 1) {
            const lotesDisponiveis = await query(`
              SELECT * FROM produtos_lotes
              WHERE produto_id = ? AND status = 'ATIVO' AND quantidade_atual > 0
              ORDER BY data_entrada ASC, id ASC
            `, [item.produto_filho_id]);

            const resPeps = alocarLotesPeps(lotesDisponiveis, item.quantidade_total);
            alocacoesLote = resPeps.alocacoes;

            for (const aloc of alocacoesLote) {
              await run(`
                UPDATE produtos_lotes 
                SET quantidade_atual = quantidade_atual - ?,
                    status = CASE WHEN quantidade_atual - ? <= 0 THEN 'ESGOTADO' ELSE 'ATIVO' END
                WHERE id = ?
              `, [aloc.quantidade, aloc.quantidade, aloc.lote_id]);
            }
          }
          item.lotes_alocados = alocacoesLote;

          const loteRefId = alocacoesLote.length > 0 ? alocacoesLote[0].lote_id : null;
          const loteRefNum = alocacoesLote.length > 0 ? alocacoesLote.map(a => a.numero_lote).join(', ') : null;

          await run(`
            INSERT INTO estoque_movimentacoes (
              produto_id, tipo, origem, motivo, quantidade,
              saldo_anterior, saldo_posterior, custo_unitario,
              documento_referencia, lote_id, numero_lote,
              observacoes, operador_nome, data_movimentacao
            ) VALUES (?, 'SAIDA', 'PRODUCAO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
          `, [
            item.produto_filho_id,
            `PRODUÇÃO ${numeroOrdem}: ${qtdProduzir}x ${produto.nome}`,
            item.quantidade_total,
            saldoAnterior,
            saldoPosterior,
            item.preco_custo,
            numeroOrdem,
            loteRefId,
            loteRefNum,
            `Consumo de insumo na ordem ${numeroOrdem}${loteRefNum ? ` (Lotes: ${loteRefNum})` : ''}`,
            body.operador_nome || 'SISTEMA'
          ]);
        }

        // 2. Dar entrada no produto acabado no Kardex (ENTRADA)
        const saldoAcabadoAnterior = parseFloat(produto.estoque_atual || 0);
        const saldoAcabadoPosterior = saldoAcabadoAnterior + qtdProduzir;

        await run(`
          UPDATE produtos 
          SET estoque_atual = ?, preco_custo = ?, data_atualizacao = datetime('now', 'localtime')
          WHERE id = ?
        `, [saldoAcabadoPosterior, custoUnitarioFinal, produtoId]);

        // Se o produto acabado controlar lote, gera novo lote rastreável de produção
        let loteAcabadoId = null;
        let loteAcabadoNum = null;
        if (produto.controla_lote === 1) {
          const lotesExistentes = await query("SELECT numero_lote FROM produtos_lotes WHERE numero_lote IS NOT NULL");
          loteAcabadoNum = gerarNumeroLotePreventivo(lotesExistentes, 'LOTE-PROD');
          const dataHoje = new Date().toISOString().slice(0, 10);
          const insLoteAcabado = await run(`
            INSERT INTO produtos_lotes (
              produto_id, numero_lote, quantidade_inicial, quantidade_atual,
              data_entrada, curtume_origem, tonalidade, custo_unitario,
              status, observacoes, data_cadastro
            ) VALUES (?, ?, ?, ?, ?, 'FABRICAÇÃO PRÓPRIA', 'PADRÃO', ?, 'ATIVO', ?, datetime('now', 'localtime'))
          `, [
            produtoId,
            loteAcabadoNum,
            qtdProduzir,
            qtdProduzir,
            dataHoje,
            custoUnitarioFinal,
            `Ordem de Produção ${numeroOrdem}`
          ]);
          loteAcabadoId = insLoteAcabado.lastInsertRowid;
        }

        await run(`
          INSERT INTO estoque_movimentacoes (
            produto_id, tipo, origem, motivo, quantidade,
            saldo_anterior, saldo_posterior, custo_unitario,
            documento_referencia, lote_id, numero_lote,
            observacoes, operador_nome, data_movimentacao
          ) VALUES (?, 'ENTRADA', 'PRODUCAO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        `, [
          produtoId,
          `PRODUÇÃO ${numeroOrdem} CONCLUÍDA`,
          qtdProduzir,
          saldoAcabadoAnterior,
          saldoAcabadoPosterior,
          custoUnitarioFinal,
          numeroOrdem,
          loteAcabadoId,
          loteAcabadoNum,
          `Entrada de produto acabado gerado pela ordem ${numeroOrdem}${loteAcabadoNum ? ` (Lote: ${loteAcabadoNum})` : ''}`,
          body.operador_nome || 'SISTEMA'
        ]);

        // 3. Gravar Ordem de Produção
        const obs = body.observacoes ? String(body.observacoes).trim() : '';
        const avisoNegativo = itensFaltantes.length > 0 ? ` [AVISO: Produzido com insumos negativos autorizados]` : '';

        const resultadoOrdem = await run(`
          INSERT INTO producao_ordens (
            numero, produto_id, quantidade, custo_insumos, custo_adicional, custo_total,
            custo_unitario_final, status, data_producao, operador_nome, observacoes, itens_consumidos
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'CONCLUIDA', datetime('now', 'localtime'), ?, ?, ?)
        `, [
          numeroOrdem,
          produtoId,
          qtdProduzir,
          custoInsumosTotal,
          custoAdicionalTotal,
          custoTotalOrdem,
          custoUnitarioFinal,
          body.operador_nome || 'SISTEMA',
          (obs + avisoNegativo).trim(),
          JSON.stringify(snapshotItensConsumidos)
        ]);

        await registrarLog({
          clienteId: null,
          clienteNome: 'PCP / Produção',
          tipoAcao: 'CRIAR_ORDEM_PRODUCAO',
          camposAlterados: ['producao_ordens', 'estoque_movimentacoes'],
          detalhes: `Ordem de Produção ${numeroOrdem} concluída: ${qtdProduzir}x ${produto.nome}. Custo final: R$ ${custoUnitarioFinal.toFixed(2)}/un.`,
          req
        }).catch(() => {});

        return responder(res, 201, {
          success: true,
          ordem_id: resultadoOrdem.lastInsertRowid,
          numero: numeroOrdem,
          produto_id: produtoId,
          produto_nome: produto.nome,
          quantidade: qtdProduzir,
          custo_insumos: custoInsumosTotal,
          custo_adicional: custoAdicionalTotal,
          custo_total: custoTotalOrdem,
          custo_unitario_final: custoUnitarioFinal,
          itens_faltantes_aviso: itensFaltantes.length > 0 ? itensFaltantes : undefined
        });
      }
    }

    return responder(res, 404, { error: 'Rota de produção não encontrada.', pathname });

  } catch (err) {
    console.error('[ERRO API PRODUÇÃO]', err);
    return responder(res, 500, { error: 'Erro interno ao processar produção', detalhes: err.message });
  }
}
