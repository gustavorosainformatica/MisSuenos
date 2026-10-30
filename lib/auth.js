/**
 * Módulo de Autenticação e Segurança (RBAC) - Mis Sueños ERP
 * Autor: Gustavo Rosa Informática
 * 
 * Utiliza o módulo nativo node:crypto (KDF Scrypt) para geração de hashes seguros
 * e funções de validação de permissões granulares por papel (Role-Based Access Control).
 */

import crypto from 'node:crypto';

// Salt padrão do sistema para hashing de senhas
const AUTH_SALT = process.env.AUTH_SECRET_SALT || 'missuenos_erp_security_salt_2026';

/**
 * Papéis padrão do sistema e suas permissões pré-configuradas
 */
export const PAPEIS_SISTEMA = {
  ADMIN: {
    nome: 'Administrador Geral',
    cor: '#00d4ff',
    permissoes: {
      admin: true,
      clientes_ver: true,
      clientes_criar: true,
      clientes_editar: true,
      clientes_excluir: true,
      pedidos_ver: true,
      pedidos_criar: true,
      pedidos_editar: true,
      pedidos_excluir: true,
      produtos_ver: true,
      produtos_editar: true,
      produtos_custo: true,
      fiscal_emitir: true,
      configuracoes: true,
      usuarios_gerenciar: true
    }
  },
  VENDAS: {
    nome: 'Vendas & Atendimento',
    cor: '#10b981',
    permissoes: {
      admin: false,
      clientes_ver: true,
      clientes_criar: true,
      clientes_editar: true,
      clientes_excluir: false,
      pedidos_ver: true,
      pedidos_criar: true,
      pedidos_editar: true,
      pedidos_excluir: false,
      produtos_ver: true,
      produtos_editar: false,
      produtos_custo: false,
      fiscal_emitir: true,
      configuracoes: false,
      usuarios_gerenciar: false
    }
  },
  EXPEDICAO: {
    nome: 'Expedição & Logística',
    cor: '#f59e0b',
    permissoes: {
      admin: false,
      clientes_ver: true,
      clientes_criar: false,
      clientes_editar: false,
      clientes_excluir: false,
      pedidos_ver: true,
      pedidos_criar: false,
      pedidos_editar: true, // atualizar status de envio e rastreio
      pedidos_excluir: false,
      produtos_ver: true,
      produtos_editar: true, // atualizar contagem de estoque físico
      produtos_custo: false,
      fiscal_emitir: false,
      configuracoes: false,
      usuarios_gerenciar: false
    }
  },
  FINANCEIRO: {
    nome: 'Financeiro & Fiscal',
    cor: '#a855f7',
    permissoes: {
      admin: false,
      clientes_ver: true,
      clientes_criar: false,
      clientes_editar: false,
      clientes_excluir: false,
      pedidos_ver: true,
      pedidos_criar: false,
      pedidos_editar: false,
      pedidos_excluir: false,
      produtos_ver: true,
      produtos_editar: false,
      produtos_custo: true,
      fiscal_emitir: true,
      configuracoes: false,
      usuarios_gerenciar: false
    }
  },
  CLIENTE: {
    nome: 'Portal do Cliente (Externo)',
    cor: '#38bdf8',
    permissoes: {
      admin: false,
      portal_cliente: true,
      clientes_ver: false,
      pedidos_proprios: true
    }
  }
};

/**
 * Gera hash seguro para senha usando scrypt nativo
 */
export function gerarHashSenha(senhaPura) {
  if (!senhaPura || typeof senhaPura !== 'string') {
    throw new Error('Senha deve ser uma string não vazia');
  }
  return crypto.scryptSync(senhaPura, AUTH_SALT, 32).toString('hex');
}

/**
 * Valida se a senha digitada corresponde ao hash gravado no banco
 */
export function verificarSenha(senhaDigitada, hashSalvo) {
  if (!senhaDigitada || !hashSalvo) return false;
  try {
    const hashTentativa = crypto.scryptSync(senhaDigitada, AUTH_SALT, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hashTentativa), Buffer.from(hashSalvo));
  } catch {
    return false;
  }
}

/**
 * Gera um token simples e seguro de sessão
 */
export function gerarTokenSessao(usuarioId, login) {
  const payload = `${usuarioId}:${login}:${Date.now()}`;
  const hmac = crypto.createHmac('sha256', AUTH_SALT).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

/**
 * Valida um token de sessão
 */
export function validarTokenSessao(token) {
  if (!token) return null;
  try {
    const decodificado = Buffer.from(token, 'base64url').toString('utf-8');
    const partes = decodificado.split(':');
    if (partes.length !== 4) return null;
    const [usuarioId, login, timestampStr, hmacSalvo] = partes;
    const payload = `${usuarioId}:${login}:${timestampStr}`;
    const hmacEsperado = crypto.createHmac('sha256', AUTH_SALT).update(payload).digest('hex');
    
    if (crypto.timingSafeEqual(Buffer.from(hmacEsperado), Buffer.from(hmacSalvo))) {
      return { usuarioId: parseInt(usuarioId, 10), login, timestamp: parseInt(timestampStr, 10) };
    }
    return null;
  } catch {
    return null;
  }
}
