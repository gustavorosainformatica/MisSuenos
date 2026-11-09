/**
 * Módulo de Validações e Formatações de Documentos e Cadastros - Mis Sueños ERP
 * Suporte a Node.js ESM e Navegadores Modernos.
 */

/**
 * Remove qualquer caractere que não seja número e limita a maxDigitos.
 */
export function limparApenasNumeros(valor, maxDigitos = 14) {
  if (!valor) return '';
  return String(valor).replace(/\D/g, '').slice(0, maxDigitos);
}

/**
 * Remove qualquer caractere que não seja número e limita a 14 dígitos (Documento).
 */
export function limparDocumento(valor) {
  return limparApenasNumeros(valor, 14);
}

/**
 * Aplica máscara progressiva e dinâmica para CPF (11 dígitos) e CNPJ (14 dígitos).
 * Rejeita letras e caracteres não numéricos.
 */
export function aplicarMascaraCpfCnpj(valor) {
  const digitos = limparDocumento(valor);
  if (!digitos) return '';

  if (digitos.length <= 11) {
    // Formata progressivamente como CPF: 000.000.000-00
    return digitos
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d{1,2})$/, '$1.$2.$3-$4');
  } else {
    // Formata progressivamente como CNPJ: 00.000.000/0000-00
    return digitos
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  }
}

/**
 * Valida o algoritmo de Dígito Verificador do CPF (Módulo 11 da Receita Federal).
 */
export function validarCpf(cpf) {
  const limpo = limparDocumento(cpf);
  if (limpo.length !== 11) return false;

  // Rejeita números com todos os dígitos iguais
  if (/^(\d)\1{10}$/.test(limpo)) return false;

  // 1º Dígito Verificador
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(limpo.charAt(i), 10) * (10 - i);
  }
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(limpo.charAt(9), 10)) return false;

  // 2º Dígito Verificador
  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(limpo.charAt(i), 10) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(limpo.charAt(10), 10)) return false;

  return true;
}

/**
 * Valida o algoritmo de Dígito Verificador do CNPJ (Módulo 11 da Receita Federal).
 */
export function validarCnpj(cnpj) {
  const limpo = limparDocumento(cnpj);
  if (limpo.length !== 14) return false;

  // Rejeita sequências repetidas
  if (/^(\d)\1{13}$/.test(limpo)) return false;

  // 1º Dígito Verificador
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma = 0;
  for (let i = 0; i < 12; i++) {
    soma += parseInt(limpo.charAt(i), 10) * pesos1[i];
  }
  let resto = soma % 11;
  let digito1 = resto < 2 ? 0 : 11 - resto;
  if (digito1 !== parseInt(limpo.charAt(12), 10)) return false;

  // 2º Dígito Verificador
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  soma = 0;
  for (let i = 0; i < 13; i++) {
    soma += parseInt(limpo.charAt(i), 10) * pesos2[i];
  }
  resto = soma % 11;
  let digito2 = resto < 2 ? 0 : 11 - resto;
  if (digito2 !== parseInt(limpo.charAt(13), 10)) return false;

  return true;
}

/**
 * Validação unificada de Documento (CPF ou CNPJ).
 */
export function validarDocumentoFiscal(doc) {
  const limpo = limparDocumento(doc);
  if (!limpo) {
    return { valido: true, tipo: 'VAZIO', digitos: '' };
  }
  if (limpo.length === 11) {
    return { valido: validarCpf(limpo), tipo: 'CPF', digitos: limpo };
  }
  if (limpo.length === 14) {
    return { valido: validarCnpj(limpo), tipo: 'CNPJ', digitos: limpo };
  }
  return { valido: false, tipo: 'INCOMPLETO', digitos: limpo };
}

/**
 * Aplica máscara progressiva de CEP (00000-000).
 */
export function aplicarMascaraCep(valor) {
  const digitos = limparApenasNumeros(valor, 8);
  if (!digitos) return '';
  return digitos.replace(/^(\d{5})(\d)/, '$1-$2');
}

/**
 * Valida se o CEP possui exatamente 8 dígitos numéricos válidos.
 */
export function validarCep(cep) {
  const limpo = limparApenasNumeros(cep, 8);
  if (!limpo) {
    return { valido: true, tipo: 'VAZIO', digitos: '' };
  }
  if (limpo.length === 8) {
    return { valido: true, tipo: 'CEP', digitos: limpo };
  }
  return { valido: false, tipo: 'INCOMPLETO', digitos: limpo };
}

/**
 * Aplica máscara dinâmica progressiva de Telefone no Brasil:
 * Fixo (10 dígitos): (00) 0000-0000
 * Celular (11 dígitos): (00) 00000-0000
 */
export function aplicarMascaraTelefone(valor) {
  const digitos = limparApenasNumeros(valor, 11);
  if (!digitos) return '';

  if (digitos.length <= 2) {
    return `(${digitos}`;
  }
  if (digitos.length <= 6) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  }
  if (digitos.length <= 10) {
    // Formato Fixo: (XX) XXXX-XXXX
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }
  // Formato Celular (11 dígitos): (XX) XXXXX-XXXX
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7, 11)}`;
}

/**
 * Valida a consistência de Telefone (DDD nacional válido 11-99 e 10 ou 11 dígitos).
 */
export function validarTelefone(telefone) {
  const limpo = limparApenasNumeros(telefone, 11);
  if (!limpo) {
    return { valido: true, tipo: 'VAZIO', digitos: '' };
  }
  if (limpo.length < 10) {
    return { valido: false, tipo: 'INCOMPLETO', digitos: limpo };
  }

  // DDD não pode começar com 0 nem ser menor que 11
  const ddd = parseInt(limpo.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) {
    return { valido: false, tipo: 'DDD_INVALIDO', digitos: limpo };
  }

  if (limpo.length === 11) {
    // Celular no Brasil deve ter 9 como primeiro dígito após DDD
    const primeiroDigito = limpo.charAt(2);
    if (primeiroDigito !== '9') {
      return { valido: false, tipo: 'CELULAR_SEM_NONO_DIGITO', digitos: limpo };
    }
    return { valido: true, tipo: 'CELULAR', digitos: limpo };
  }

  if (limpo.length === 10) {
    return { valido: true, tipo: 'FIXO', digitos: limpo };
  }

  return { valido: false, tipo: 'INVALIDO', digitos: limpo };
}

/**
 * Normaliza campos de texto para Caixa Alta (Uppercase) preservando strings vazias ou nulas.
 */
export function paraCaixaAlta(texto) {
  if (texto === null || texto === undefined) return '';
  return String(texto).trim().toUpperCase();
}
