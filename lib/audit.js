/**
 * Módulo Central de Trilha de Auditoria e Telemetria Operacional
 * Autor: Gustavo Rosa Informática
 * Projeto: Mis Sueños ERP v2.0
 * 
 * Diretrizes:
 * - Blindagem Zero-PII: Mascaramento preventivo de CPFs, CNPJs, senhas e tokens.
 * - Resiliência: Execução assíncrona não bloqueante (erros de log nunca abortam transações).
 * - Diffs Estruturados: Armazena estados anteriores e novos em formato JSON seguro.
 */

import { run } from './db.js';

/**
 * Sanitiza valores sensíveis para estrito cumprimento da regra Zero-PII
 * @param {*} valor Objeto, array ou valor primitivo a ser sanitizado
 * @returns {*} Cópia sanitizada com dados sensíveis mascarados
 */
export function mascararZeroPII(valor) {
  if (valor === null || valor === undefined) return valor;

  if (typeof valor === 'string') {
    // Mascara CPF (11 dígitos formatados ou limpos)
    let s = valor.replace(/\b(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})\b/g, '***.$2.$3-**');
    // Mascara CNPJ (14 dígitos formatados ou limpos)
    s = s.replace(/\b(\d{2})\.?(\d{3})\.?(\d{3})\/?(\d{4})-?(\d{2})\b/g, '**.$2.$3/****-**');
    return s;
  }

  if (Array.isArray(valor)) {
    return valor.map(item => mascararZeroPII(item));
  }

  if (typeof valor === 'object') {
    const limpo = {};
    const chavesSensiveis = ['senha', 'pin', 'password', 'token', 'secret', 'jwt', 'auth_token', 'hash_senha', 'cartao'];

    for (const [k, v] of Object.entries(valor)) {
      const kLower = k.toLowerCase();
      if (chavesSensiveis.some(cs => kLower.includes(cs))) {
        limpo[k] = '[PROTEGIDO]';
      } else {
        limpo[k] = mascararZeroPII(v);
      }
    }
    return limpo;
  }

  return valor;
}

/**
 * Serializa de forma segura um objeto ou string para JSON mascarado
 * @param {*} dado
 * @returns {string|null}
 */
export function serializarSeguro(dado) {
  if (dado === null || dado === undefined) return null;
  if (typeof dado === 'string') {
    try {
      const obj = JSON.parse(dado);
      return JSON.stringify(mascararZeroPII(obj));
    } catch {
      return mascararZeroPII(dado);
    }
  }
  try {
    return JSON.stringify(mascararZeroPII(dado));
  } catch (err) {
    return `[ERRO_SERIALIZACAO: ${err.message}]`;
  }
}

/**
 * Calcula campos alterados entre dois estados
 * @param {Object} anterior 
 * @param {Object} novo 
 * @returns {string[]} Lista de nomes de campos modificados
 */
export function calcularDiff(anterior, novo) {
  if (!anterior || !novo || typeof anterior !== 'object' || typeof novo !== 'object') {
    return [];
  }
  const chaves = new Set([...Object.keys(anterior), ...Object.keys(novo)]);
  const alterados = [];

  for (const k of chaves) {
    const vAnt = JSON.stringify(anterior[k]);
    const vNov = JSON.stringify(novo[k]);
    if (vAnt !== vNov) {
      alterados.push(k);
    }
  }
  return alterados;
}

/**
 * Registra um evento formal na trilha de auditoria
 * 
 * @param {Object} params
 * @param {number|null} [params.usuarioId] ID do operador que realizou a ação
 * @param {string} [params.usuarioNome] Nome do operador (default: 'SISTEMA')
 * @param {string} [params.modulo] Módulo operacional ('CLIENTES', 'PEDIDOS', 'ESTOQUE', 'FINANCEIRO', 'SISTEMA', 'AUTH', 'FISCAL')
 * @param {string} params.tipoAcao Código da ação ('CRIACAO', 'EDICAO', 'EXCLUSAO', 'STATUS_CHANGE', etc.)
 * @param {string|number|null} [params.referenciaId] Identificador público (ex: '#PED-1048', 'CLIENTE #1140')
 * @param {string} [params.descricao] Frase descritiva em PT-BR
 * @param {Object|string|null} [params.dadosAnteriores] Estado antes da modificação
 * @param {Object|string|null} [params.dadosNovos] Estado após a modificação
 * @param {string[]|string} [params.camposAlterados] Lista de propriedades alteradas
 * @param {string} [params.detalhes] Detalhes complementares
 * @param {Object} [params.req] Objeto de requisição HTTP para extrair IP e User-Agent
 * @param {string} [params.ip] IP explícito
 * @param {string} [params.userAgent] User-Agent explícito
 * @param {number|null} [params.clienteId] Compatibilidade retroativa
 * @param {string|null} [params.clienteNome] Compatibilidade retroativa
 * @returns {Promise<boolean>} Retorna true se inserido com sucesso
 */
export async function registrarLog({
  usuarioId = null,
  usuarioNome = 'SISTEMA',
  modulo = 'GERAL',
  tipoAcao,
  referenciaId = null,
  descricao = '',
  dadosAnteriores = null,
  dadosNovos = null,
  camposAlterados = null,
  detalhes = '',
  req = null,
  ip = null,
  userAgent = null,
  clienteId = null,
  clienteNome = null
} = {}) {
  try {
    const ipFinal = ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '127.0.0.1';
    const uaFinal = userAgent || (req?.headers?.['user-agent'] || 'Web Client').slice(0, 200);
    const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // Se campos alterados não foi informado mas temos anterior e novo, calcula automaticamente
    let camposLista = camposAlterados;
    if (!camposLista && dadosAnteriores && dadosNovos && typeof dadosAnteriores === 'object' && typeof dadosNovos === 'object') {
      camposLista = calcularDiff(dadosAnteriores, dadosNovos);
    }
    const camposStr = Array.isArray(camposLista) ? camposLista.join(', ') : (camposLista || '');

    const dadosAntJson = serializarSeguro(dadosAnteriores);
    const dadosNovJson = serializarSeguro(dadosNovos);

    const descFinal = descricao || detalhes || `${tipoAcao} em ${modulo} (${referenciaId || 'registro'})`;

    const sql = `
      INSERT INTO logs_auditoria (
        usuario_id,
        usuario_nome,
        cliente_id,
        cliente_nome,
        modulo,
        tipo_acao,
        referencia_id,
        descricao,
        dados_anteriores,
        dados_novos,
        campos_alterados,
        detalhes,
        ip_origem,
        user_agent,
        data_hora
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await run(sql, [
      usuarioId ? Number(usuarioId) : null,
      String(usuarioNome || 'SISTEMA').toUpperCase(),
      clienteId ? Number(clienteId) : null,
      clienteNome ? String(clienteNome).toUpperCase() : null,
      String(modulo || 'GERAL').toUpperCase(),
      String(tipoAcao || 'ACAO').toUpperCase(),
      referenciaId ? String(referenciaId) : null,
      descFinal,
      dadosAntJson,
      dadosNovJson,
      camposStr,
      detalhes || '',
      ipFinal,
      uaFinal,
      dataHora
    ]);

    return true;
  } catch (err) {
    // Falha em log nunca deve derrubar o fluxo de negócio do ERP
    console.error('[AUDIT AVISO] Falha ao gravar log de auditoria:', err.message);
    return false;
  }
}
