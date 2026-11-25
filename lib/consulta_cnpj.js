import { normalizarCnpj, validarCnpj } from './validacoes_erp.js';

const texto = valor => String(valor ?? '').trim().toUpperCase();

/**
 * Extrai 10 ou 11 dígitos numéricos limpos do telefone (ignora ramais ou números secundários).
 */
function extrairTelefoneLimpo(tel) {
  if (!tel) return '';
  const primeiro = String(tel).split('/')[0].split(';')[0].replace(/\D/g, '');
  if (primeiro.length >= 10 && primeiro.length <= 11) return primeiro;
  return primeiro.slice(0, 11);
}

/**
 * Extrai até 8 dígitos do CEP.
 */
function extrairCepLimpo(cep) {
  if (!cep) return '';
  return String(cep).replace(/\D/g, '').slice(0, 8);
}

/**
 * Normaliza os dados retornados pelos provedores de consulta pública.
 */
function formatarDadosEmpresa(empresa) {
  const rua = texto(empresa.logradouro);
  const tipo = texto(empresa.descricao_tipo_de_logradouro);
  const logradouroCompleto = tipo && rua && !rua.startsWith(tipo + ' ') ? `${tipo} ${rua}` : rua;
  const telBruto = empresa.ddd_telefone_1 || empresa.telefone || '';
  const emailBruto = String(empresa.email || '').trim().toLowerCase().split('/')[0].split(';')[0].trim();

  return {
    razao_social: texto(empresa.razao_social || empresa.nome),
    nome_fantasia: texto(empresa.nome_fantasia || empresa.fantasia),
    telefone: extrairTelefoneLimpo(telBruto),
    email: emailBruto,
    endereco: {
      cep: extrairCepLimpo(empresa.cep),
      logradouro: logradouroCompleto,
      numero: texto(empresa.numero),
      complemento: texto(empresa.complemento),
      bairro: texto(empresa.bairro),
      cidade: texto(empresa.municipio),
      uf: texto(empresa.uf)
    }
  };
}

/**
 * Executa requisição HTTP com User-Agent corporativo e timeout seguro.
 */
async function fetchComTimeout(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resposta = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 MisSuenosERP/1.0'
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    return resposta;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Consulta dados cadastrais de Pessoa Jurídica com cascata multi-provedor (alta disponibilidade).
 * Provedores:
 * 1. BrasilAPI (Principal)
 * 2. Minha Receita (Fallback 1)
 * 3. ReceitaWS (Fallback 2)
 */
export async function consultarEmpresa(cnpj) {
  const documento = normalizarCnpj(cnpj);
  if (!validarCnpj(documento)) {
    return { status: 400, dados: { error: 'Confira o CNPJ informado. Dígitos verificadores incorretos.' } };
  }

  const provedores = [
    { nome: 'BrasilAPI', url: 'https://brasilapi.com.br/api/cnpj/v1/' + documento },
    { nome: 'Minha Receita', url: 'https://minhareceita.org/' + documento },
    { nome: 'ReceitaWS', url: 'https://receitaws.com.br/v1/cnpj/' + documento }
  ];

  let encontrado404 = false;

  for (const prov of provedores) {
    try {
      const resposta = await fetchComTimeout(prov.url, 4500);
      if (resposta.status === 404) {
        encontrado404 = true;
        continue;
      }
      if (!resposta.ok) continue;

      const empresa = await resposta.json();
      if (!empresa) continue;

      const razao = empresa.razao_social || empresa.nome;
      if (!texto(razao)) continue;

      return {
        status: 200,
        dados: formatarDadosEmpresa(empresa)
      };
    } catch {
      // Falha de rede ou timeout neste provedor: avança para o próximo da cascata
    }
  }

  if (encontrado404) {
    return {
      status: 404,
      dados: { error: 'CNPJ não encontrado na base pública da Receita Federal. Confira na Receita ou preencha manualmente.' }
    };
  }

  return {
    status: 503,
    dados: { error: 'Serviço de consulta de CNPJ temporariamente indisponível. Preencha os campos manualmente.' }
  };
}
