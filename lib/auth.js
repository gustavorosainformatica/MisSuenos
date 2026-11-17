import crypto from 'node:crypto';

// Usado apenas para validar hashes antigos durante a migraÃ§Ã£o apÃ³s login bem-sucedido.
const SALT_LEGADO_SENHA = 'missuenos_erp_security_salt_2026';

const PERMISSOES_ADMIN = {
  admin: true,
  clientes_ver: true, clientes_criar: true, clientes_editar: true, clientes_excluir: true, clientes_exportar: true,
  pedidos_ver: true, pedidos_criar: true, pedidos_editar: true, pedidos_excluir: true,
  produtos_ver: true, produtos_editar: true, produtos_excluir: true, produtos_custo: true,
  estoque_ver: true, estoque_movimentar: true, lotes_gerenciar: true,
  financeiro_ver: true, financeiro_editar: true, financeiro_excluir: true, financeiro_conciliar: true,
  compras_ver: true, compras_importar: true,
  logistica_ver: true, logistica_cotar: true, logistica_editar: true,
  producao_ver: true, producao_executar: true, producao_estornar: true,
  fiscal_ver: true, fiscal_emitir: true, relatorios_ver: true, auditoria_ver: true, sistema_admin: true,
  anexos_ver: true, anexos_adicionar: true, anexos_excluir: true,
  configuracoes_ver: true, configuracoes: true, usuarios_gerenciar: true,
  terraplanagem_gerenciar: true, oficina_ver: true, oficina_editar: true
};

export const PAPEIS_SISTEMA = {
  ADMIN: {
    nome: 'Administrador Geral', cor: '#00d4ff', permissoes: { ...PERMISSOES_ADMIN }
  },
  VENDAS: {
    nome: 'Vendas & Atendimento', cor: '#10b981', permissoes: {
      admin: false,
      clientes_ver: true, clientes_criar: true, clientes_editar: true, clientes_excluir: false, clientes_exportar: false,
      pedidos_ver: true, pedidos_criar: true, pedidos_editar: true, pedidos_excluir: false,
      produtos_ver: true, produtos_editar: false, produtos_excluir: false, produtos_custo: false,
      estoque_ver: true, estoque_movimentar: false, lotes_gerenciar: false,
      financeiro_ver: false, financeiro_editar: false, financeiro_excluir: false, financeiro_conciliar: false,
      compras_ver: false, compras_importar: false,
      logistica_ver: true, logistica_cotar: true, logistica_editar: false,
      producao_ver: false, producao_executar: false, producao_estornar: false,
      fiscal_ver: true, fiscal_emitir: true, relatorios_ver: false, auditoria_ver: false, sistema_admin: false,
      anexos_ver: true, anexos_adicionar: true, anexos_excluir: false,
      configuracoes_ver: true, configuracoes: false, usuarios_gerenciar: false
    }
  },
  EXPEDICAO: {
    nome: 'ExpediÃ§Ã£o & LogÃ­stica', cor: '#f59e0b', permissoes: {
      admin: false,
      clientes_ver: true, clientes_criar: false, clientes_editar: false, clientes_excluir: false, clientes_exportar: false,
      pedidos_ver: true, pedidos_criar: false, pedidos_editar: true, pedidos_excluir: false,
      produtos_ver: true, produtos_editar: true, produtos_excluir: false, produtos_custo: false,
      estoque_ver: true, estoque_movimentar: true, lotes_gerenciar: true,
      financeiro_ver: false, financeiro_editar: false, financeiro_excluir: false, financeiro_conciliar: false,
      compras_ver: false, compras_importar: false,
      logistica_ver: true, logistica_cotar: true, logistica_editar: true,
      producao_ver: true, producao_executar: true, producao_estornar: false,
      fiscal_ver: false, fiscal_emitir: false, relatorios_ver: false, auditoria_ver: false, sistema_admin: false,
      anexos_ver: true, anexos_adicionar: true, anexos_excluir: false,
      configuracoes_ver: true, configuracoes: false, usuarios_gerenciar: false
    }
  },
  FINANCEIRO: {
    nome: 'Financeiro & Fiscal', cor: '#a855f7', permissoes: {
      admin: false,
      clientes_ver: true, clientes_criar: false, clientes_editar: false, clientes_excluir: false, clientes_exportar: false,
      pedidos_ver: true, pedidos_criar: false, pedidos_editar: false, pedidos_excluir: false,
      produtos_ver: true, produtos_editar: false, produtos_excluir: false, produtos_custo: true,
      estoque_ver: true, estoque_movimentar: false, lotes_gerenciar: false,
      financeiro_ver: true, financeiro_editar: true, financeiro_excluir: true, financeiro_conciliar: true,
      compras_ver: true, compras_importar: true,
      logistica_ver: true, logistica_cotar: false, logistica_editar: false,
      producao_ver: false, producao_executar: false, producao_estornar: false,
      fiscal_ver: true, fiscal_emitir: true, relatorios_ver: true, auditoria_ver: false, sistema_admin: false,
      anexos_ver: true, anexos_adicionar: true, anexos_excluir: false,
      configuracoes_ver: true, configuracoes: false, usuarios_gerenciar: false
    }
  },
  CLIENTE: {
    nome: 'Portal do Cliente (Externo)', cor: '#38bdf8', permissoes: {
      admin: false, portal_cliente: true, pedidos_proprios: true
    }
  }
};

/** Gera hash de senha com salt aleatÃ³rio e exclusivo por senha. */
export function gerarHashSenha(senhaPura) {
  if (!senhaPura || typeof senhaPura !== 'string') throw new Error('Senha deve ser uma string nÃ£o vazia');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(senhaPura, salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

/** Valida hashes atuais e os hashes antigos que ainda aguardam migraÃ§Ã£o no login. */
export function verificarSenha(senhaDigitada, hashSalvo) {
  if (!senhaDigitada || !hashSalvo) return false;
  try {
    const partes = String(hashSalvo).split('$');
    const hashCalculado = partes.length === 3 && partes[0] === 'scrypt'
      ? crypto.scryptSync(senhaDigitada, partes[1], 32).toString('hex')
      : crypto.scryptSync(senhaDigitada, SALT_LEGADO_SENHA, 32).toString('hex');
    const esperado = partes.length === 3 && partes[0] === 'scrypt' ? partes[2] : String(hashSalvo);
    const bufferCalculado = Buffer.from(hashCalculado, 'hex');
    const bufferEsperado = Buffer.from(esperado, 'hex');
    return bufferCalculado.length === bufferEsperado.length && crypto.timingSafeEqual(bufferCalculado, bufferEsperado);
  } catch {
    return false;
  }
}

export function ehHashSenhaLegado(hashSalvo) {
  return !String(hashSalvo || '').startsWith('scrypt$');
}
