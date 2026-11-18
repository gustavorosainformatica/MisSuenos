/**
 * Hub Fiscal Desacoplado & Gestor de Certificados Digitais A1 (Ticket 11)
 * Compatível com:
 * - NF-e Modelo 55 (Produtos / SEFAZ)
 * - NFS-e Padrão Nacional (DPS / Serviços)
 * - Conector WLG Sistemas REST e Emissão Própria
 * - Certificados PKCS#12 (.pfx / .p12)
 */

/**
 * Sanitiza caracteres especiais para injeção segura em strings HTML / DANFE
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Tabela de códigos IBGE das UFs para composição da Chave de Acesso SEFAZ
 */
export const CODIGOS_UF = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17',
  MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27',
  SE: '28', BA: '29', MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41',
  SC: '42', RS: '43', MS: '50', MT: '51', GO: '52', DF: '53'
};

/**
 * Calcula o Dígito Verificador (Módulo 11) para os 43 dígitos da chave da NF-e
 * Pesos de 2 a 9 da direita para a esquerda
 */
export function calcularDvChaveAcesso(chave43) {
  const chave = String(chave43 || '').replace(/\D/g, '');
  if (chave.length !== 43) {
    throw new Error(`A base da chave para cálculo do DV deve conter exatamente 43 dígitos (recebido ${chave.length}).`);
  }

  let soma = 0;
  let peso = 2;
  for (let i = chave.length - 1; i >= 0; i--) {
    soma += parseInt(chave[i], 10) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }

  const resto = soma % 11;
  const dv = (resto === 0 || resto === 1) ? 0 : 11 - resto;
  return String(dv);
}

/** Geracao local de chave fiscal desativada: somente a SEFAZ/provedor fornece chave oficial. */
export function gerarChaveAcessoNfe() {
  throw new Error('Chaves de acesso so podem ser obtidas de uma NF-e autorizada pela SEFAZ.');
}

/**
 * Formata a Chave de Acesso em grupos de 4 dígitos para visualização humana
 * Ex: 4326 1100 0000 0000 0191 5500 1000 0000 0118 8888 8884
 */
export function formatarChaveAcesso(chave) {
  const c = String(chave || '').replace(/\D/g, '');
  if (c.length !== 44) return chave;
  return c.replace(/(\d{4})/g, '$1 ').trim();
}

/** Validacao local ficticia de certificado removida; use validacao criptografica real no provedor. */
export function validarCertificadoA1() {
  return { valido: false, erro: 'Validacao local de certificado indisponivel; consulte o provedor fiscal.' };
}

/** XML fiscal local desativado: somente XML oficial retornado pelo provedor pode ser usado. */
export function montarXmlNfe55() {
  throw new Error('Geracao local de XML fiscal desativada.');
}

/** DANFE local desativado: somente DANFE oficial retornado pelo provedor pode ser usado. */
export function gerarDanfeHtml() {
  throw new Error('Geracao local de DANFE fiscal desativada.');
}

export class FiscalHub {
  constructor(config = {}) {
    this.driver = config.driver || 'wlg';
    this.ambiente = config.ambiente || Number(process.env.FISCAL_AMBIENTE || 2);
    this.emitente = config.emitente || {};
  }

  /**
   * Emissão unificada de NF-e Modelo 55
   */
  async emitirNfe() {
    throw new Error('Emissão pelo FiscalHub legado desativada. Use o fluxo WLG assíncrono autenticado.');
  }
}

export default FiscalHub;
