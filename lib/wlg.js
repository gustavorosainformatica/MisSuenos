import { createHash } from 'node:crypto';

/**
 * Conector REST para API Fiscal Gratuita WLG Sistemas (Ticket 7)
 * Base URL: https://fiscal.wlgsistemas.com.br/api/v1
 * 
 * Funcionalidades:
 * - Autenticacao JWT via WLG_CLIENT_ID e WLG_CLIENT_SECRET
 * - Emissao assincrona e consulta de operacoes NF-e modelo 55
 * - Download dos artefatos oficiais retornados pela WLG
 * - Nenhuma classificacao fiscal e presumida pelo conector
 */

const WLG_DEFAULT_BASE_URL = 'https://fiscal.wlgsistemas.com.br/api/v1';

function gerarDataHoraEmissaoFiscal() {
  const data = new Date(Date.now() - 60_000);
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', timeZoneName: 'longOffset'
  }).formatToParts(data);
  const valor = (tipo) => partes.find((parte) => parte.type === tipo)?.value;
  const offset = String(valor('timeZoneName') || '').replace(/^GMT/, '');
  if (!/^[-+]\d{2}:\d{2}$/.test(offset)) throw new Error('Não foi possível determinar o fuso da emissão fiscal.');
  return `${valor('year')}-${valor('month')}-${valor('day')}T${valor('hour')}:${valor('minute')}:${valor('second')}${offset}`;
}

let tokenCache = {
  accessToken: null,
  expiresAt: 0,
  credentialsFingerprint: null
};

/** Lê e valida a configuração não secreta necessária para operações fiscais. */
export function obterConfiguracaoWlg() {
  const baseUrl = (process.env.WLG_API_URL || WLG_DEFAULT_BASE_URL).replace(/\/+$/, '');
  const empresaId = String(process.env.WLG_EMPRESA_ID || '').trim();
  const ambiente = Number(process.env.WLG_AMBIENTE || 2);

  if (!empresaId) throw new Error('WLG_EMPRESA_ID não configurado no gerenciador de segredos.');
  if (![1, 2].includes(ambiente)) throw new Error('WLG_AMBIENTE deve ser 1 (produção) ou 2 (homologação).');
  let endpoint;
  try { endpoint = new URL(baseUrl); } catch { throw new Error('WLG_API_URL inválida.'); }
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'fiscal.wlgsistemas.com.br' || endpoint.username || endpoint.password) {
    throw new Error('WLG_API_URL deve apontar para o endpoint HTTPS oficial da WLG.');
  }

  return { baseUrl, empresaId, ambiente };
}

/**
 * Determina automaticamente o CFOP de venda com base na UF do emitente e do destinatário
 */
/** O CFOP depende da operacao fiscal aprovada; nao e inferido apenas pela UF. */
export function calcularCfopVenda() {
  throw new Error('Informe o CFOP aprovado para esta operacao fiscal.');
}

/** Nao aplica NCM, CFOP, origem ou CSOSN presumidos. */
export function validarItensFiscais() {
  return { valido: false, erros: ['Classificacao fiscal aprovada obrigatoria; nenhum padrao e presumido.'], itens: [] };
}

/**
 * Obtém Token JWT na API WLG Sistemas
 */
export async function obterTokenWlg() {
  const config = obterConfiguracaoWlg();
  const clientId = process.env.WLG_CLIENT_ID;
  const clientSecret = process.env.WLG_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Credenciais WLG ausentes. Configure WLG_CLIENT_ID e WLG_CLIENT_SECRET no gerenciador de segredos.');
  }

  const fingerprint = createHash('sha256').update(`${clientId}\0${clientSecret}`).digest('hex');
  const agora = Date.now();
  if (tokenCache.accessToken && tokenCache.credentialsFingerprint === fingerprint && tokenCache.expiresAt > agora + 30000) {
    return tokenCache.accessToken;
  }

  const resp = await fetch(`${config.baseUrl}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId,
      clientSecret
    })
  });

  if (!resp.ok) {
    throw new Error(`Falha na autenticação WLG Fiscal (HTTP ${resp.status}). Verifique as credenciais e o acesso da empresa.`);
  }

  let data;
  try {
    data = await resp.json();
  } catch {
    throw new Error('Resposta de autenticação WLG inválida: JSON esperado.');
  }
  if (typeof data?.accessToken !== 'string' || !data.accessToken || data.tokenType !== 'Bearer') {
    throw new Error('Resposta de autenticação WLG inválida: token Bearer não encontrado.');
  }
  const expiresIn = Number(data.expiresIn);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('Resposta de autenticação WLG inválida: validade do token ausente.');
  }
  tokenCache.accessToken = data.accessToken;
  tokenCache.expiresAt = agora + (expiresIn * 1000);
  tokenCache.credentialsFingerprint = fingerprint;
  return tokenCache.accessToken;
}

/** Obtém dados do emitente e certificado diretamente do cadastro WLG. */
export async function obterEmitenteWlg() {
  const config = obterConfiguracaoWlg();
  const token = await obterTokenWlg();
  const headers = { Authorization: `Bearer ${token}` };
  const empresaResp = await fetch(`${config.baseUrl}/empresas/${encodeURIComponent(config.empresaId)}`, { headers });
  if (!empresaResp.ok) throw new Error(`Falha ao consultar empresa WLG (HTTP ${empresaResp.status}).`);
  const empresa = await empresaResp.json();
  if (String(empresa?.empresaId || '') !== config.empresaId) throw new Error('A empresa configurada não corresponde ao cadastro WLG.');

  const certificadoResp = await fetch(`${config.baseUrl}/empresas/${encodeURIComponent(config.empresaId)}/certificado`, { headers });
  if (!certificadoResp.ok) throw new Error(`Falha ao consultar certificado WLG (HTTP ${certificadoResp.status}).`);
  const certificado = await certificadoResp.json();
  if (!certificado?.cadastrado || certificado.vencido || !certificado.validadeFim || new Date(certificado.validadeFim) <= new Date()) {
    throw new Error('O certificado A1 cadastrado na WLG não está válido para emissão.');
  }

  const endereco = empresa.endereco || {};
  const codigoIbge = String(endereco.codigoIbgeMunicipio || '');
  if (!empresa.cnpj || !empresa.razaoSocial || !Number.isInteger(Number(empresa.crt)) || !endereco.logradouro || !codigoIbge) {
    throw new Error('O cadastro do emitente na WLG está incompleto para emissão fiscal.');
  }
  const municipioResp = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${encodeURIComponent(codigoIbge)}`);
  if (!municipioResp.ok) throw new Error('Não foi possível validar o município do emitente.');
  const municipio = await municipioResp.json();
  const uf = municipio?.microrregiao?.mesorregiao?.UF?.sigla;
  if (!municipio?.nome || !uf) throw new Error('O município do emitente não retornou UF válida.');

  return {
    cnpj: empresa.cnpj,
    xNome: empresa.razaoSocial,
    xFant: empresa.nomeFantasia || undefined,
    ie: empresa.inscricaoEstadual || undefined,
    im: empresa.inscricaoMunicipal || undefined,
    crt: Number(empresa.crt),
    fone: empresa.telefone || undefined,
    endereco: {
      xLgr: endereco.logradouro,
      nro: endereco.numero || 'S/N',
      xCpl: endereco.complemento || undefined,
      xBairro: endereco.bairro || undefined,
      xMun: municipio.nome,
      cMun: codigoIbge,
      uf,
      cep: String(endereco.cep || '').replace(/\D/g, ''),
      cPais: '1058',
      xPais: 'BRASIL'
    }
  };
}

export function validarPayloadNfeWlg(documento) {
  if (!documento || typeof documento !== 'object' || Array.isArray(documento)) {
    throw new Error('Documento WLG inválido: objeto esperado.');
  }
  const { ide, itens, totais, pagamento } = documento;
  if (!ide || !itens || !totais || !pagamento) throw new Error('Documento WLG incompleto: ide, itens, totais e pagamento são obrigatórios.');
  const camposIde = ['finNFe', 'idDest', 'indFinal', 'indPres', 'modelo', 'natOp', 'numero', 'serie', 'tpImp', 'tpNF'];
  if (camposIde.some((campo) => ide[campo] === undefined || ide[campo] === null || ide[campo] === '')) {
    throw new Error('Identificação NF-e incompleta conforme o contrato WLG.');
  }
  const serie = Number(ide.serie);
  if (!Number.isInteger(serie) || !((serie >= 0 && serie <= 889) || (serie >= 920 && serie <= 969))) {
    throw new Error('Série NF-e fora das faixas permitidas para emissão do contribuinte.');
  }
  if (Number(ide.modelo) !== 55 || !Number.isInteger(Number(ide.numero)) || Number(ide.numero) < 1 || Number(ide.numero) > 999_999_999) {
    throw new Error('Identificação NF-e inválida: modelo 55 e número inteiro positivo são obrigatórios.');
  }
  if (!Array.isArray(itens) || itens.length === 0) throw new Error('Documento WLG incompleto: informe ao menos um item.');
  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];
    const obrigatorios = ['cProd', 'xProd', 'ncm', 'cfop', 'uCom', 'qCom', 'vUnCom', 'vProd', 'imposto'];
    if (!item || obrigatorios.some((campo) => item[campo] === undefined || item[campo] === null || item[campo] === '')) {
      throw new Error(`Item ${i + 1} incompleto para emissão WLG.`);
    }
    if (!/^\d{8}$/.test(String(item.ncm)) || !/^\d{4}$/.test(String(item.cfop))) {
      throw new Error(`Classificação fiscal inválida no item ${i + 1}.`);
    }
    if (!item.imposto.icms || !item.imposto.pis || !item.imposto.cofins) {
      throw new Error(`Tributação incompleta no item ${i + 1}.`);
    }
    for (const campo of ['qCom', 'vUnCom', 'vProd']) {
      if (!Number.isFinite(Number(item[campo])) || Number(item[campo]) <= 0) throw new Error(`Valor inválido no item ${i + 1}.`);
    }
  }
  if (!Number.isFinite(Number(totais.vnf)) || Number(totais.vnf) <= 0) throw new Error('Total da NF-e inválido.');
  if (!Array.isArray(pagamento.detalhes) || pagamento.detalhes.length === 0) throw new Error('Documento WLG incompleto: informe ao menos uma forma de pagamento.');
  for (const detalhe of pagamento.detalhes) {
    if (!detalhe?.tPag || !Number.isFinite(Number(detalhe.vPag)) || Number(detalhe.vPag) < 0) {
      throw new Error('Forma de pagamento incompleta ou inválida.');
    }
  }
}

/** Envia um payload fiscal normalizado pelo contrato público da WLG, somente em homologação. */
export async function emitirNfeWlg(documento) {
  const config = obterConfiguracaoWlg();
  if (config.ambiente !== 2) {
    throw new Error('Emissão WLG bloqueada: integração habilitada somente para homologação (ambiente 2).');
  }
  validarPayloadNfeWlg(documento);

  const token = await obterTokenWlg();
  const emitente = await obterEmitenteWlg();
  const payload = {
    ...documento,
    empresaId: config.empresaId,
    tipoAmbiente: 2,
    emitente,
    ide: { ...documento.ide, dhEmi: gerarDataHoraEmissaoFiscal() }
  };
  let resp;
  try {
    resp = await fetch(`${config.baseUrl}/nfe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
  } catch {
    const error = new Error('Conexão interrompida durante o envio WLG; o recebimento externo é inconclusivo.');
    error.code = 'WLG_ENVIO_INCONCLUSIVO';
    throw error;
  }
  let resultado;
  try { resultado = await resp.json(); }
  catch {
    const error = new Error(`Resposta inválida da WLG ao enviar NF-e (HTTP ${resp.status}).`);
    error.code = resp.ok || resp.status >= 500 ? 'WLG_ENVIO_INCONCLUSIVO' : 'WLG_ENVIO_REJEITADO';
    throw error;
  }
  if (!resp.ok) {
    const error = new Error(`Falha ao enviar NF-e para a WLG (HTTP ${resp.status}).`);
    error.code = resp.status >= 500 ? 'WLG_ENVIO_INCONCLUSIVO' : 'WLG_ENVIO_REJEITADO';
    throw error;
  }
  if (typeof resultado?.operationId !== 'string' || !resultado.operationId) {
    const error = new Error('Resposta de emissão WLG inválida: operationId ausente.');
    error.code = 'WLG_ENVIO_INCONCLUSIVO';
    throw error;
  }
  return {
    operationId: resultado.operationId,
    status: resultado.status === 'PROCESSANDO' ? 'PROCESSANDO' : 'INDETERMINADO'
  };
}

/** Consulta uma operação assíncrona e retorna somente os campos fiscais documentados. */
export async function consultarOperacaoWlg(operationId) {
  const config = obterConfiguracaoWlg();
  if (config.ambiente !== 2) throw new Error('Consulta desta integração restrita à homologação (ambiente 2).');
  const id = String(operationId || '').trim();
  if (!id || id.length > 200 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error('Identificador de operação WLG inválido.');
  }
  const token = await obterTokenWlg();
  const resp = await fetch(`${config.baseUrl}/operacoes/${encodeURIComponent(id)}`, {
    method: 'GET', headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!resp.ok) throw new Error(`Falha ao consultar operação WLG (HTTP ${resp.status}).`);
  let resultado;
  try { resultado = await resp.json(); }
  catch { throw new Error('Resposta de consulta WLG inválida: JSON esperado.'); }
  if (!['PROCESSANDO', 'SUCCESSO', 'ERRO'].includes(resultado?.status)) {
    throw new Error('Resposta de consulta WLG inválida: status desconhecido.');
  }
  return {
    operationId: id,
    status: resultado.status,
    chaveNfe: resultado.status === 'SUCCESSO' ? resultado.chave || null : null,
    codigoStatus: resultado.cStat ?? null,
    protocolo: resultado.status === 'SUCCESSO' ? resultado.protocolo || null : null,
    dataProtocolo: resultado.status === 'SUCCESSO' ? resultado.dhProtocolo || null : null,
    dataAutorizacao: resultado.status === 'SUCCESSO' ? resultado.dataAutorizacao || null : null,
    motivoErro: resultado.status === 'ERRO' ? resultado.mensagem || 'A WLG informou erro sem detalhamento.' : null
  };
}

/** Baixa um artefato oficial apenas para chave de NF-e válida. */
export async function obterArtefatoNfeWlg(chaveNfe, tipo) {
  const config = obterConfiguracaoWlg();
  if (config.ambiente !== 2) throw new Error('Downloads desta integração restritos à homologação (ambiente 2).');
  const chave = String(chaveNfe || '').replace(/\D/g, '');
  if (!/^\d{44}$/.test(chave)) throw new Error('Chave NF-e inválida para download.');
  const rotas = {
    xml: { extensao: 'xml', contentType: 'application/xml' },
    danfe: { extensao: 'pdf', contentType: 'application/pdf' },
    zip: { extensao: 'zip', contentType: 'application/zip' }
  };
  const tipoArtefato = String(tipo || '').toLowerCase();
  const artefato = rotas[tipoArtefato];
  if (!artefato) throw new Error('Tipo de artefato inválido. Use xml, danfe ou zip.');

  const token = await obterTokenWlg();
  const resp = await fetch(`${config.baseUrl}/nfe/${chave}/${tipoArtefato}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000)
  });
  if (!resp.ok) throw new Error(`Falha ao baixar artefato WLG (HTTP ${resp.status}).`);
  const contentType = String(resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType !== artefato.contentType) throw new Error('A WLG retornou formato diferente do artefato solicitado.');
  const buffer = Buffer.from(await resp.arrayBuffer());
  if (!buffer.length || buffer.length > 25 * 1024 * 1024) throw new Error('Tamanho inválido do artefato WLG.');
  return { buffer, contentType: artefato.contentType, extensao: artefato.extensao };
}

/** Bloqueia a assinatura antiga que fabricava campos fiscais não confirmados. */
export async function transmitirNfeWlg() {
  throw new Error('Fluxo legado de emissão WLG desabilitado até a confirmação dos campos fiscais obrigatórios.');
}
