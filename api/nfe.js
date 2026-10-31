/**
 * Vercel Serverless Function: /api/nfe
 * Central de Geração, Validação NCM/CFOP e Transmissão Fiscal (Ticket 7):
 * 1. NFS-e (Portal Nacional da Receita Federal - Padrão DPS / XML)
 * 2. NF-e (Produtos SEFAZ - Modelo 55 via Conector WLG Sistemas REST + TXT Emissor SEFAZ)
 * Grava histórico de emissão no banco de dados ativo (logs_auditoria).
 */

import { registrarLog, get } from '../lib/db.js';
import { calcularCfopVenda, validarItensFiscais, transmitirNfeWlg } from '../lib/wlg.js';

function responder(res, status, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(data);
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      return res.status(204).end();
    }
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    return res.end();
  }

  if (req.method !== 'POST') {
    return responder(res, 405, { error: 'Método não permitido. Utilize POST.' });
  }

  try {
    const payload = await parseBody(req);
    const { tipoNota, cliente, servico, produtos, valores, emitente } = payload;

    if (!tipoNota || !cliente) {
      return responder(res, 400, { error: 'tipoNota e dados do cliente são obrigatórios.' });
    }

    const agora = new Date();
    const dataHoraIso = agora.toISOString();
    const dataHoraBR = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // =========================================================================
    // 1. NFS-e: PORTAL NACIONAL DA RECEITA FEDERAL (SERVIÇOS)
    // =========================================================================
    if (tipoNota === 'NFSE_SERVICO') {
      const valorServico = parseFloat(valores?.valorTotal || servico?.valor || 0);
      const docTomador = (cliente.cpf || cliente.cnpj || '').replace(/\D/g, '');
      const tipoDocTomador = docTomador.length > 11 ? 'CNPJ' : 'CPF';
      const cnae = servico?.cnae || '1414-2/00';
      const codigoTributacao = servico?.codigoTributacao || '14.01.01';
      const discriminacao = servico?.discriminacao || 'Prestação de serviços artesanais em couro e peles.';

      const numeroDps = Math.floor(100000 + Math.random() * 900000);
      const serieDps = '1';

      const xmlDps = `<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infDPS id="DPS${numeroDps}">
    <tpAmb>1</tpAmb>
    <dhEmi>${dataHoraIso}</dhEmi>
    <verAplic>1.0.0</verAplic>
    <serie>${serieDps}</serie>
    <nDPS>${numeroDps}</nDPS>
    <dCompet>${agora.toISOString().split('T')[0]}</dCompet>
    <tpEmit>1</tpEmit>
    <prest>
      <CNPJ>${emitente?.cnpj?.replace(/\D/g, '') || '00000000000191'}</CNPJ>
      <xNome>${emitente?.razaoSocial || 'MIS SUEÑOS COUROS & PELES'}</xNome>
      <end>
        <xLgr>${emitente?.logradouro || 'Rua das Indústrias'}</xLgr>
        <nro>${emitente?.numero || '100'}</nro>
        <xBairro>${emitente?.bairro || 'Centro'}</xBairro>
        <cMun>4319901</cMun>
        <UF>${emitente?.uf || 'RS'}</UF>
        <CEP>${emitente?.cep?.replace(/\D/g, '') || '93800000'}</CEP>
      </end>
    </prest>
    <toma>
      <${tipoDocTomador}>${docTomador}</${tipoDocTomador}>
      <xNome>${cliente.nome}</xNome>
      <end>
        <xLgr>${cliente.logradouro || ''}</xLgr>
        <nro>${cliente.numero || 'S/N'}</nro>
        <xBairro>${cliente.bairro || ''}</xBairro>
        <cMun>${cliente.codigoIbge || '4319901'}</cMun>
        <xMun>${cliente.cidade || ''}</xMun>
        <UF>${cliente.uf || 'RS'}</UF>
        <CEP>${(cliente.cep || '').replace(/\D/g, '')}</CEP>
      </end>
      <fone>${(cliente.telefone || '').replace(/\D/g, '')}</fone>
    </toma>
    <serv>
      <cLocPrestacao>4319901</cLocPrestacao>
      <cTribNac>${codigoTributacao}</cTribNac>
      <CNAE>${cnae.replace(/\D/g, '')}</CNAE>
      <xDescServ>${discriminacao}</xDescServ>
    </serv>
    <valores>
      <vServPrest>${valorServico.toFixed(2)}</vServPrest>
      <trib>
        <tribMun>
          <tribISSQN>1</tribISSQN>
          <cPaisResult>1058</cPaisResult>
          <tpRetISSQN>1</tpRetISSQN>
        </tribMun>
      </trib>
    </valores>
  </infDPS>
</DPS>`;

      await registrarLog({
        clienteId: cliente.id || null,
        clienteNome: cliente.nome,
        tipoAcao: 'EMISSAO_NFSE_SERVICO',
        camposAlterados: ['dps_gerada', 'valor', 'servico'],
        detalhes: `NFS-e Portal Nacional | DPS #${numeroDps} | R$ ${valorServico.toFixed(2)} | ${discriminacao.slice(0, 50)}`,
        req: req
      });

      return responder(res, 200, {
        success: true,
        tipoNota: 'NFSE_SERVICO',
        numeroDps,
        serieDps,
        dataEmissao: dataHoraBR,
        valorTotal: valorServico,
        xmlDps,
        resumoPortalNacional: {
          orgao: 'Receita Federal do Brasil (Portal Nacional da NFS-e)',
          linkPortal: 'https://www.nfse.gov.br/EmissorNacional/',
          tomador: cliente.nome,
          documento: docTomador,
          cnae: cnae,
          codigoTributacao: codigoTributacao,
          discriminacao: discriminacao,
          valor: valorServico.toFixed(2)
        }
      });
    }

    // =========================================================================
    // 2. NF-e: SEFAZ / WLG SISTEMAS (PRODUTOS / MERCADORIAS - MODELO 55)
    // =========================================================================
    if (tipoNota === 'NFE_PRODUTO') {
      const valorProdutos = parseFloat(valores?.valorTotal || 0);
      const numeroNfe = Math.floor(1000 + Math.random() * 9000);
      const serieNfe = '1';
      const emitNome = emitente?.razaoSocial || 'MIS SUEÑOS COUROS & PELES';
      const emitCnpj = (emitente?.cnpj || '00000000000191').replace(/\D/g, '');
      const ufEmitente = emitente?.uf || 'RS';
      const ufDestinatario = cliente?.uf || 'RS';
      const cfopAutomatico = calcularCfopVenda(ufEmitente, ufDestinatario);

      // Enriquecer itens com NCM oficial do banco de dados caso não tenha sido enviado no payload
      const listaItensBrutos = Array.isArray(produtos) && produtos.length > 0
        ? produtos
        : [{
            codigo: 'COD-01',
            nome: payload.descricaoMercadoria || 'Artigos de Couro e Selaria Mis Sueños',
            ncm: payload.ncm || '41079110',
            cfop: cfopAutomatico,
            unidade: 'UN',
            quantidade: 1,
            preco_unitario: valorProdutos,
            subtotal: valorProdutos
          }];

      for (const item of listaItensBrutos) {
        if (!item.ncm && (item.produto_id || item.id || item.codigo)) {
          const prodDb = item.produto_id || item.id
            ? await get('SELECT ncm, codigo, unidade FROM produtos WHERE id = ?', [item.produto_id || item.id])
            : await get('SELECT ncm, codigo, unidade FROM produtos WHERE codigo = ?', [item.codigo]);
          if (prodDb?.ncm) item.ncm = prodDb.ncm;
          if (!item.codigo && prodDb?.codigo) item.codigo = prodDb.codigo;
          if (!item.unidade && prodDb?.unidade) item.unidade = prodDb.unidade;
        }
        if (!item.ncm) item.ncm = '42050000'; // Fallback oficial NCM obras de couro
      }

      const validacaoFiscal = validarItensFiscais(listaItensBrutos, ufEmitente, ufDestinatario);
      if (!validacaoFiscal.valido) {
        return responder(res, 400, {
          error: 'Falha na validação fiscal de NCM dos produtos.',
          erros: validacaoFiscal.erros
        });
      }

      // Linhas de itens para o arquivo TXT SEFAZ
      const linhasItensTxt = [];
      for (const it of validacaoFiscal.itens) {
        linhasItensTxt.push(`H|${it.numero_item}||`);
        linhasItensTxt.push(`I|${it.codigo_produto}||${it.descricao}|${it.ncm}||${it.cfop}|${it.unidade}|${it.quantidade.toFixed(4)}|${it.valor_unitario.toFixed(4)}|${it.valor_total.toFixed(2)}||${it.unidade}|${it.quantidade.toFixed(4)}|${it.valor_unitario.toFixed(4)}|||||1||||`);
      }

      // Gera arquivo TXT compatível com o Emissor SEFAZ/Sebrae incluindo NCM e CFOP automáticos
      const idDest = ufEmitente.toUpperCase() === ufDestinatario.toUpperCase() ? '1' : '2';
      const txtSefaz = [
        'NOTAFISCAL|1',
        `A|4.00|NFe|`,
        `B|43|${numeroNfe}|${cfopAutomatico === '5102' ? 'VENDA DENTRO DO ESTADO' : 'VENDA FORA DO ESTADO'}|0|55|${serieNfe}|${numeroNfe}|${agora.toISOString().slice(0, 10)}||1|${idDest}|4319901|1|1||1|1|3|1|0|0|||`,
        `C|${emitNome}|${emitNome}|||||1|`,
        `C02|${emitCnpj}|`,
        `E|${cliente.nome}|9|||||`,
        `E02|${(cliente.cpf || cliente.cnpj || '').replace(/\D/g, '')}|`,
        `E05|${cliente.logradouro || ''}|${cliente.numero || 'S/N'}|${cliente.complemento || ''}|${cliente.bairro || ''}|4319901|${cliente.cidade || ''}|${ufDestinatario}|${(cliente.cep || '').replace(/\D/g, '')}|1058|BRASIL||`,
        ...linhasItensTxt,
        `W|`,
        `W02|0.00|0.00|0.00|0.00|${valorProdutos.toFixed(2)}|0.00|0.00|0.00|0.00|0.00|0.00|0.00|0.00|${valorProdutos.toFixed(2)}|`
      ].join('\r\n');

      // Conector WLG Sistemas REST API
      let resultadoWlg = null;
      try {
        resultadoWlg = await transmitirNfeWlg({
          emitente,
          cliente,
          itensValidados: validacaoFiscal.itens,
          cfopAplicado: validacaoFiscal.cfopAplicado,
          valorTotal: valorProdutos
        });
      } catch (wlgErr) {
        resultadoWlg = {
          transmitidoApi: false,
          erroApi: wlgErr.message
        };
      }

      await registrarLog({
        clienteId: cliente.id || null,
        clienteNome: cliente.nome,
        tipoAcao: 'EMISSAO_NFE_PRODUTO',
        camposAlterados: ['txt_sefaz', 'wlg_nfe', 'cfop', 'ncm'],
        detalhes: `NF-e Modelo 55 | NF #${numeroNfe} | CFOP ${validacaoFiscal.cfopAplicado} | Itens: ${validacaoFiscal.itens.length} | Valor: R$ ${valorProdutos.toFixed(2)}`,
        req: req
      });

      return responder(res, 200, {
        success: true,
        tipoNota: 'NFE_PRODUTO',
        numeroNfe,
        serieNfe,
        cfopAplicado: validacaoFiscal.cfopAplicado,
        itensValidados: validacaoFiscal.itens,
        dataEmissao: dataHoraBR,
        valorTotal: valorProdutos,
        txtSefaz,
        wlgFiscal: resultadoWlg,
        resumoSefaz: {
          modelo: 'NF-e Modelo 55 (Produtos)',
          orgao: 'SEFAZ Estadual (RS) / Conector WLG Sistemas',
          cfop: `${validacaoFiscal.cfopAplicado} (${validacaoFiscal.cfopAplicado === '5102' ? 'Estadual RS' : 'Interestadual'})`,
          destinatario: cliente.nome,
          documento: cliente.cpf || cliente.cnpj,
          ufDestino: ufDestinatario,
          valor: valorProdutos.toFixed(2)
        }
      });
    }

    return responder(res, 400, { error: 'Tipo de nota inválido. Escolha NFSE_SERVICO ou NFE_PRODUTO.' });
  } catch (err) {
    console.error('[API NFE ERRO]', err);
    return responder(res, 500, { error: 'Erro ao gerar nota fiscal: ' + err.message });
  }
}
