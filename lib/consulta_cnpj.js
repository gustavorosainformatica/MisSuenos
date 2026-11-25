import { normalizarCnpj, validarCnpj } from './validacoes_erp.js';

const texto = valor => String(valor ?? '').trim().toUpperCase();

export async function consultarEmpresa(cnpj) {
  const documento = normalizarCnpj(cnpj);
  if (!validarCnpj(documento)) {
    return { status: 400, dados: { error: 'Confira o CNPJ informado.' } };
  }

  try {
    const resposta = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + documento, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(7000)
    });
    if (resposta.status === 404) {
      return { status: 404, dados: { error: 'CNPJ não encontrado na base. Confira na Receita ou preencha manualmente.' } };
    }
    if (!resposta.ok) throw new Error();
    const empresa = await resposta.json();
    if (normalizarCnpj(empresa.cnpj) !== documento || !texto(empresa.razao_social)) throw new Error();
    const rua = texto(empresa.logradouro);
    const tipo = texto(empresa.descricao_tipo_de_logradouro);
    return {
      status: 200,
      dados: {
        razao_social: texto(empresa.razao_social),
        nome_fantasia: texto(empresa.nome_fantasia),
        telefone: texto(empresa.ddd_telefone_1),
        email: texto(empresa.email),
        endereco: {
          cep: texto(empresa.cep),
          logradouro: tipo && rua && !rua.startsWith(tipo + ' ') ? tipo + ' ' + rua : rua,
          numero: texto(empresa.numero),
          complemento: texto(empresa.complemento),
          bairro: texto(empresa.bairro),
          cidade: texto(empresa.municipio),
          uf: texto(empresa.uf)
        }
      }
    };
  } catch {
    return { status: 503, dados: { error: 'Consulta indisponível. Tente novamente ou preencha manualmente.' } };
  }
}
