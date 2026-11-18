import { get } from './db.js';
import { PAPEIS_SISTEMA } from './auth.js';
import { validarSessaoRequisicao, validarTokenCsrf } from './sessoes.js';

const METODOS_COM_ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function responder(res, status, dados) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(dados);
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  return res.end(JSON.stringify(dados));
}

function permissaoDaRota(metodo, pathname) {
  const m = String(metodo || 'GET').toUpperCase();
  let parametros = new URLSearchParams();
  try {
    const url = new URL(pathname, 'http://localhost');
    pathname = url.pathname;
    parametros = url.searchParams;
  } catch {}
  const acao = parametros.get('acao') || '';

  if (pathname === '/api/auth' || pathname.startsWith('/api/auth/')) return { interna: true };
  if (pathname === '/api/sistema' && m === 'GET' && acao === 'health') return { interna: true };
  if (pathname === '/api/usuarios' || pathname.startsWith('/api/usuarios/')) return { permissao: 'usuarios_gerenciar' };
  if (pathname === '/api/terraplanagem' || pathname.startsWith('/api/terraplanagem/')) return { permissao: 'terraplanagem_gerenciar' };
  if (['/api/veiculos', '/api/os', '/api/revenda'].some(prefixo => pathname === prefixo || pathname.startsWith(`${prefixo}/`))) {
    return { permissao: m === 'GET' ? 'oficina_ver' : 'oficina_editar' };
  }
  if (pathname === '/api/clientes' || /^\/api\/clientes\/\d+(?:\/logs)?$/.test(pathname)) {
    if (m === 'GET') return { permissao: 'clientes_ver' };
    if (m === 'POST') return { permissao: 'clientes_criar' };
    if (m === 'PUT' || m === 'PATCH') return { permissao: 'clientes_editar' };
    if (m === 'DELETE') return { permissao: 'clientes_excluir' };
  }
  if (pathname === '/api/pedidos' || /^\/api\/pedidos\/\d+$/.test(pathname)) {
    if (m === 'GET') return { permissao: 'pedidos_ver' };
    if (m === 'POST') return { permissao: 'pedidos_criar' };
    if (m === 'PUT' || m === 'PATCH') return { permissao: 'pedidos_editar' };
    if (m === 'DELETE') return { permissao: 'pedidos_excluir' };
  }
  if (/^\/api\/produtos\/\d+\/bom(?:\/|$)/.test(pathname)) {
    return { permissao: m === 'GET' ? 'producao_ver' : 'producao_executar' };
  }
  if (/^\/api\/produtos\/\d+\/lotes(?:\/|$)/.test(pathname)) {
    return { permissao: m === 'GET' ? 'estoque_ver' : 'lotes_gerenciar' };
  }
  if (pathname === '/api/produtos' || pathname.startsWith('/api/produtos/')) {
    if (m === 'GET') return { permissao: 'produtos_ver' };
    if (m === 'POST' || m === 'PUT' || m === 'PATCH') return { permissao: 'produtos_editar' };
    if (m === 'DELETE') return { permissao: 'produtos_excluir' };
  }
  if (pathname === '/api/financeiro' || pathname.startsWith('/api/financeiro/')) {
    if (m === 'GET') return { permissao: 'financeiro_ver' };
    if ((pathname.includes('/conciliacao/') || ['conciliacao_upload', 'reconciliar_lote'].includes(acao)) && m !== 'GET') return { permissao: 'financeiro_conciliar' };
    if (m === 'DELETE') return { permissao: 'financeiro_excluir' };
    if (m === 'POST' || m === 'PUT' || m === 'PATCH') return { permissao: 'financeiro_editar' };
  }
  if (pathname === '/api/compras' || pathname.startsWith('/api/compras/')) {
    if (m === 'GET') return { permissao: 'compras_ver' };
    if (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') return { permissao: 'compras_importar' };
  }
  if (pathname === '/api/configuracoes' || pathname.startsWith('/api/configuracoes/')) {
    return { permissao: m === 'GET' ? 'configuracoes_ver' : 'configuracoes' };
  }
  if (pathname === '/api/logs' || pathname.startsWith('/api/logs/')) return { permissao: 'auditoria_ver' };
  if (pathname === '/api/nfe' || pathname.startsWith('/api/nfe/')) {
    return { permissao: m === 'GET' ? 'fiscal_ver' : 'fiscal_emitir' };
  }
  if (pathname === '/api/sistema' || pathname.startsWith('/api/sistema/')) return { permissao: 'sistema_admin' };
  if (pathname === '/api/relatorios' || pathname.startsWith('/api/relatorios/')) return { permissao: 'relatorios_ver' };
  if (pathname === '/api/estoque' || pathname.startsWith('/api/estoque/')) {
    return { permissao: m === 'GET' ? 'estoque_ver' : 'estoque_movimentar' };
  }
  if (pathname === '/api/logistica' || pathname.startsWith('/api/logistica/')) {
    if (pathname === '/api/logistica/configuracoes' || ['configuracoes', 'salvar_configuracoes'].includes(acao)) {
      return { permissao: m === 'GET' ? 'configuracoes_ver' : 'configuracoes' };
    }
    if (m === 'GET') return { permissao: 'logistica_ver' };
    if (pathname.endsWith('/cotar') || acao === 'cotar') return { permissao: 'logistica_cotar' };
    return { permissao: 'logistica_editar' };
  }
  if (pathname === '/api/producao' || pathname.startsWith('/api/producao/') || /^\/api\/produtos\/\d+\/bom$/.test(pathname)) {
    if (pathname.endsWith('/config')) return { permissao: m === 'GET' ? 'producao_ver' : 'configuracoes' };
    if (pathname.endsWith('/estornar')) return { permissao: 'producao_estornar' };
    return { permissao: m === 'GET' ? 'producao_ver' : 'producao_executar' };
  }
  if (pathname === '/api/lotes' || pathname.startsWith('/api/lotes/') || /^\/api\/produtos\/\d+\/lotes$/.test(pathname)) {
    return { permissao: m === 'GET' ? 'estoque_ver' : 'lotes_gerenciar' };
  }
  if (pathname === '/api/anexos' || pathname.startsWith('/api/anexos/')) {
    if (m === 'GET') return { permissao: 'anexos_ver' };
    if (m === 'POST') return { permissao: 'anexos_adicionar' };
    if (m === 'DELETE') return { permissao: 'anexos_excluir' };
  }
  if (pathname === '/api/download/csv' || pathname === '/api/download/json') return { permissao: 'clientes_exportar' };
  return null;
}

async function permissoesDoUsuario(operador) {
  let padrao = PAPEIS_SISTEMA[operador.papel]?.permissoes || {};
  if (!PAPEIS_SISTEMA[operador.papel]) {
    const linha = await get("SELECT valor FROM configuracoes_sistema WHERE chave = 'papeis_customizados'");
    try {
      const papeis = JSON.parse(linha?.valor || '{}');
      padrao = papeis[operador.papel]?.permissoes || {};
    } catch {
      padrao = {};
    }
  }

  let individuais = {};
  try {
    individuais = typeof operador.permissoes === 'string'
      ? JSON.parse(operador.permissoes || '{}')
      : (operador.permissoes || {});
  } catch {
    individuais = {};
  }
  return operador.papel === 'ADMIN' ? { ...padrao, ...individuais, admin: true } : { ...padrao, ...individuais, admin: false };
}

export async function garantirAcessoApi(req, res, pathname) {
  const metodo = String(req.method || 'GET').toUpperCase();
  if (metodo === 'OPTIONS') return true;

  const politica = permissaoDaRota(metodo, pathname);
  if (politica?.interna) return true;
  if (!politica) {
    responder(res, 403, { error: 'A rota não possui política de acesso configurada.' });
    return false;
  }

  const sessao = await validarSessaoRequisicao(req);
  if (!sessao) {
    responder(res, 401, { error: 'Autenticação necessária ou sessão expirada.' });
    return false;
  }

  const operador = await get('SELECT id, nome, login, papel, permissoes, ativo, exigir_troca_senha FROM usuarios WHERE id = ?', [sessao.usuarioId]);
  if (!operador || Number(operador.ativo) !== 1) {
    responder(res, 401, { error: 'Operador inativo ou sessão inválida.' });
    return false;
  }

  if (Number(operador.exigir_troca_senha) === 1) {
    responder(res, 403, { error: 'Troque sua senha antes de usar os demais módulos.' });
    return false;
  }

  const permissoes = await permissoesDoUsuario(operador);
  if (operador.papel !== 'ADMIN' && !permissoes[politica.permissao]) {
    responder(res, 403, { error: 'Seu perfil não tem permissão para esta operação.' });
    return false;
  }

  if (METODOS_COM_ESCRITA.has(metodo) && !validarTokenCsrf(sessao, req.headers?.['x-csrf-token'])) {
    responder(res, 403, { error: 'Validação de segurança da requisição inválida. Atualize a sessão e tente novamente.' });
    return false;
  }

  req.sessao = sessao;
  req.operador = operador;
  req.permissoes = permissoes;
  return true;
}

export { permissaoDaRota, permissoesDoUsuario };
