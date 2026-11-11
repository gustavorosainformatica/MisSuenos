/**
 * Conector REST para API Fiscal Gratuita WLG Sistemas (Ticket 7)
 * Base URL: https://fiscal.wlgsistemas.com.br/api/v1
 * 
 * Funcionalidades:
 * - Autenticação JWT (POST /auth/token) via WLG_CLIENT_ID e WLG_CLIENT_SECRET
 * - Seleção automática de CFOP (5102 intraestadual RS / 6102 interestadual)
 * - Validação rigorosa de NCM de 8 dígitos em todos os itens
 * - Emissão de NF-e Modelo 55 (POST /nfe) com retorno de chave, XML e DANFE
 */

const WLG_BASE_URL = process.env.WLG_API_URL || 'https://fiscal.wlgsistemas.com.br/api/v1';

let tokenCache = {
  accessToken: null,
  expiresAt: 0
};

/**
 * Determina automaticamente o CFOP de venda com base na UF do emitente e do destinatário
 */
export function calcularCfopVenda(ufEmitente = 'RS', ufDestinatario = 'RS') {
  const emit = String(ufEmitente || 'RS').trim().toUpperCase();
  const dest = String(ufDestinatario || 'RS').trim().toUpperCase();
  return emit === dest ? '5102' : '6102';
}

/**
 * Valida se todos os itens possuem NCM de 8 dígitos numéricos
 */
export function validarItensFiscais(itens = [], ufEmitente = 'RS', ufDestinatario = 'RS') {
  const cfopPadrao = calcularCfopVenda(ufEmitente, ufDestinatario);
  const itensValidados = [];
  const erros = [];

  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];
    const ncmLimpo = String(item.ncm || '').replace(/\D/g, '');
    if (ncmLimpo.length !== 8) {
      erros.push(`Item #${i + 1} (${item.nome || item.descricao || 'Produto'}) está sem NCM válido de 8 dígitos (atual: "${item.ncm || 'vazio'}").`);
    }
    itensValidados.push({
      numero_item: i + 1,
      codigo_produto: item.codigo || `ITEM-${i + 1}`,
      descricao: item.nome || item.descricao || 'Mercadoria',
      ncm: ncmLimpo || '42050000',
      cfop: item.cfop || cfopPadrao,
      unidade: item.unidade || 'UN',
      quantidade: Number(item.quantidade || 1),
      valor_unitario: Number(item.preco_unitario || item.valor_unitario || item.valor || 0),
      valor_total: Number(item.subtotal || item.valor_total || (Number(item.quantidade || 1) * Number(item.preco_unitario || item.valor_unitario || item.valor || 0))),
      origem: 0, // 0 - Nacional
      csosn: '102' // Simples Nacional sem permissão de crédito
    });
  }

  return {
    valido: erros.length === 0,
    erros,
    cfopAplicado: cfopPadrao,
    itens: itensValidados
  };
}

/**
 * Obtém Token JWT na API WLG Sistemas
 */
export async function obterTokenWlg() {
  const clientId = process.env.WLG_CLIENT_ID;
  const clientSecret = process.env.WLG_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null; // Sem credenciais WLG configuradas no ambiente
  }

  const agora = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > agora + 30000) {
    return tokenCache.accessToken;
  }

  const resp = await fetch(`${WLG_BASE_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Falha na autenticação WLG Fiscal (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  tokenCache.accessToken = data.access_token || data.token;
  tokenCache.expiresAt = agora + ((data.expires_in || 3600) * 1000);
  return tokenCache.accessToken;
}

/**
 * Envia NF-e Modelo 55 para transmissão na WLG Sistemas (ou prepara payload homologado)
 */
export async function transmitirNfeWlg({ emitente, cliente, itensValidados, cfopAplicado, valorTotal, ambiente }) {
  const token = await obterTokenWlg();
  const tpAmb = Number(ambiente || process.env.WLG_AMBIENTE || 2); // 2 = Homologação, 1 = Produção

  const payloadWlg = {
    ambiente: tpAmb,
    natureza_operacao: cfopAplicado === '5102' ? 'VENDA DE MERCADORIA DENTRO DO ESTADO' : 'VENDA DE MERCADORIA FORA DO ESTADO',
    modelo: '55',
    serie: '1',
    emitente: {
      cnpj: (emitente?.cnpj || '00000000000191').replace(/\D/g, ''),
      razao_social: emitente?.razaoSocial || 'MIS SUEÑOS COUROS & PELES',
      inscricao_estadual: (emitente?.ie || '').replace(/\D/g, ''),
      uf: emitente?.uf || 'RS',
      municipio_ibge: emitente?.codigoIbge || '4319901' // Sapiranga/RS
    },
    destinatario: {
      documento: (cliente?.cnpj || cliente?.cpf || '').replace(/\D/g, ''),
      nome: cliente?.razao_social || cliente?.nome || 'CLIENTE CONSUMIDOR',
      inscricao_estadual: (cliente?.ie || '').replace(/\D/g, '') || 'ISENTO',
      logradouro: cliente?.logradouro || 'Rua Principal',
      numero: cliente?.numero || 'S/N',
      bairro: cliente?.bairro || 'Centro',
      municipio: cliente?.cidade || 'Sapiranga',
      uf: (cliente?.uf || 'RS').toUpperCase(),
      cep: (cliente?.cep || '93800000').replace(/\D/g, '')
    },
    itens: itensValidados,
    totais: {
      valor_produtos: Number(valorTotal || 0),
      valor_total: Number(valorTotal || 0)
    }
  };

  if (!token) {
    return {
      transmitidoApi: false,
      motivo: 'Credenciais WLG_CLIENT_ID / WLG_CLIENT_SECRET ainda não configuradas no Infisical/Vercel. Payload WLG e arquivo TXT SEFAZ gerados com NCM e CFOP validados.',
      payloadWlg
    };
  }

  const resp = await fetch(`${WLG_BASE_URL}/nfe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payloadWlg)
  });

  const resultado = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(resultado.message || resultado.error || `Erro HTTP ${resp.status} ao transmitir NF-e na WLG Sistemas.`);
  }

  return {
    transmitidoApi: true,
    chaveNfe: resultado.chave || resultado.chave_nfe || null,
    protocolo: resultado.protocolo || null,
    danfeUrl: resultado.danfe_url || resultado.pdf_url || null,
    xmlUrl: resultado.xml_url || null,
    payloadWlg,
    respostaBruta: resultado
  };
}

