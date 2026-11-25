import { get } from './db.js';
import { normalizarCnpj, validarCnpj } from './validacoes_erp.js';
import https from 'node:https';

const CODIGOS_UF = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17',
  MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27',
  SE: '28', BA: '29', MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41',
  SC: '42', RS: '43', MS: '50', MT: '51', GO: '52', DF: '53'
};

const URLS_SEFAZ_CADASTRO = {
  RS: 'https://cad.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx',
  SP: 'https://nfe.fazenda.sp.gov.br/ws/cadconsultacadastro4.asmx',
  MG: 'https://nfe.fazenda.mg.gov.br/ws/cadconsultacadastro4.asmx',
  PR: 'https://nfe.fazenda.pr.gov.br/ws/cadconsultacadastro4.asmx',
  SVRS: 'https://cad.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx'
};

/**
 * Consulta Inscrição Estadual (IE) de Pessoa Jurídica via SEFAZ / CCC.
 * - Opção 1: WebService oficial CadConsultaCadastro4 quando houver Certificado A1 ativo no banco.
 * - Opção 2: Transição fluida para o portal oficial CCC (Cadastro Centralizado de Contribuintes)
 *   quando o certificado A1 ainda não estiver provisionado.
 */
export async function consultarInscricaoEstadual(cnpj, uf = 'RS') {
  const documento = normalizarCnpj(cnpj);
  if (!validarCnpj(documento)) {
    return { status: 400, dados: { error: 'Confira o CNPJ informado para consulta de IE.' } };
  }

  const ufLimpa = String(uf || 'RS').trim().toUpperCase();

  // 1. Verifica se há Certificado Digital A1 ativo no banco (fiscal_config)
  let configFiscal = null;
  try {
    configFiscal = await get('SELECT certificado_a1_base64, certificado_senha, ambiente FROM fiscal_config ORDER BY id DESC LIMIT 1');
  } catch {
    // Tabela fiscal_config pode não estar provisionada no momento
  }

  const certificadoBase64 = configFiscal?.certificado_a1_base64;
  const certificadoSenha = configFiscal?.certificado_senha;

  // Se NÃO houver Certificado Digital A1 configurado no momento:
  // Retorna status 412 (Precondition Failed) orientando uso do atalho do CCC / Sintegra
  if (!certificadoBase64 || !certificadoSenha) {
    return {
      status: 412,
      dados: {
        sucesso: false,
        requer_a1: true,
        uf: ufLimpa,
        cnpj: documento,
        link_ccc: 'https://dfe-portal.svrs.rs.gov.br/Nfe/Ccc',
        link_sintegra: 'http://www.sintegra.gov.br/',
        mensagem: 'Certificado Digital A1 ainda não configurado no ERP. Use o atalho do CCC Nacional da SEFAZ.'
      }
    };
  }

  // Se HOUVER Certificado Digital A1:
  // Executa consulta SOAP oficial CadConsultaCadastro4
  try {
    const endpoint = URLS_SEFAZ_CADASTRO[ufLimpa] || URLS_SEFAZ_CADASTRO.SVRS;
    const pfxBuffer = Buffer.from(certificadoBase64, 'base64');

    const xmlEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4">
      <ConsCad versao="2.00" xmlns="http://www.portalfiscal.inf.br/nfe">
        <infCons>
          <xServ>CONS-CAD</xServ>
          <UF>${ufLimpa}</UF>
          <CNPJ>${documento}</CNPJ>
        </infCons>
      </ConsCad>
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;

    const agent = new https.Agent({
      pfx: pfxBuffer,
      passphrase: certificadoSenha,
      rejectUnauthorized: false
    });

    const resposta = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'SOAPAction': 'http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4'
      },
      body: xmlEnvelope,
      agent,
      signal: AbortSignal.timeout(6000)
    });

    const textoXml = await resposta.text();
    const ieMatch = textoXml.match(/<IE>([^<]+)<\/IE>/i);
    const sitMatch = textoXml.match(/<cSit>([^<]+)<\/cSit>/i);
    const xNomeMatch = textoXml.match(/<xNome>([^<]+)<\/xNome>/i);

    if (ieMatch && ieMatch[1]) {
      return {
        status: 200,
        dados: {
          sucesso: true,
          ie: String(ieMatch[1]).trim().toUpperCase(),
          situacao: sitMatch?.[1] === '1' ? 'HABILITADO' : 'NÃO HABILITADO',
          razao_social: xNomeMatch?.[1] || ''
        }
      };
    }

    return {
      status: 404,
      dados: {
        sucesso: false,
        link_ccc: 'https://dfe-portal.svrs.rs.gov.br/Nfe/Ccc',
        mensagem: 'Inscrição Estadual não localizada na SEFAZ. Consulte no portal do CCC ou marque como ISENTO.'
      }
    };
  } catch (err) {
    return {
      status: 503,
      dados: {
        sucesso: false,
        link_ccc: 'https://dfe-portal.svrs.rs.gov.br/Nfe/Ccc',
        mensagem: 'Serviço da SEFAZ temporariamente indisponível. Consulte no portal do CCC ou marque como ISENTO.'
      }
    };
  }
}
