/**
 * Vercel Serverless Function Dispatcher / API Gateway Central: /api
 * Unificação de Rotas Serverless - Mis Sueños ERP
 * Autor: Gustavo Rosa Informática
 * 
 * Este arquivo unifica todos os endpoints da API REST em uma única Serverless Function,
 * garantindo:
 * 1. Respeito estrito aos limites do plano gratuito da Vercel (Hobby Tier <= 12 funções).
 * 2. Redução de Cold Starts (uma única função aquecida atende todo o sistema).
 * 3. Roteamento dinâmico e seguro para todos os módulos existentes.
 */

import handlerAuth from './auth.js';
import handlerUsuarios from './usuarios.js';
import handlerClientes from './clientes.js';
import handlerPedidos from './pedidos.js';
import handlerProdutos from './produtos.js';
import handlerFinanceiro from './financeiro.js';
import handlerCompras from './compras.js';
import handlerConfiguracoes from './configuracoes.js';
import handlerAnexos from './anexos.js';
import handlerLogs from './logs.js';
import handlerNfe from './nfe.js';
import handlerSistema from './sistema.js';
import handlerRelatorios from './relatorios.js';

export default async function handler(req, res) {
  // CORS Preflight Global
  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      return res.status(204).end();
    }
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
    });
    return res.end();
  }

  const rawUrl = req.url || '/';
  // Extrai o caminho sem query string
  const pathname = rawUrl.split('?')[0];

  try {
    if (pathname === '/api/auth' || pathname.startsWith('/api/auth/')) {
      return await handlerAuth(req, res);
    }
    if (pathname === '/api/usuarios' || pathname.startsWith('/api/usuarios/')) {
      return await handlerUsuarios(req, res);
    }
    if (pathname === '/api/clientes' || pathname.startsWith('/api/clientes/')) {
      return await handlerClientes(req, res);
    }
    if (pathname === '/api/pedidos' || pathname.startsWith('/api/pedidos/')) {
      return await handlerPedidos(req, res);
    }
    if (pathname === '/api/produtos' || pathname.startsWith('/api/produtos/')) {
      return await handlerProdutos(req, res);
    }
    if (pathname === '/api/financeiro' || pathname.startsWith('/api/financeiro/')) {
      return await handlerFinanceiro(req, res);
    }
    if (pathname === '/api/compras' || pathname.startsWith('/api/compras/')) {
      return await handlerCompras(req, res);
    }
    if (pathname === '/api/configuracoes' || pathname.startsWith('/api/configuracoes/')) {
      return await handlerConfiguracoes(req, res);
    }
    if (pathname === '/api/anexos' || pathname.startsWith('/api/anexos/')) {
      return await handlerAnexos(req, res);
    }
    if (pathname === '/api/logs' || pathname.startsWith('/api/logs/')) {
      return await handlerLogs(req, res);
    }
    if (pathname === '/api/nfe' || pathname.startsWith('/api/nfe/')) {
      return await handlerNfe(req, res);
    }
    if (pathname === '/api/sistema' || pathname.startsWith('/api/sistema/')) {
      return await handlerSistema(req, res);
    }
    if (pathname === '/api/relatorios' || pathname.startsWith('/api/relatorios/')) {
      return await handlerRelatorios(req, res);
    }

    // Rota não encontrada
    if (typeof res.status === 'function') {
      return res.status(404).json({
        error: 'Endpoint não encontrado',
        pathname
      });
    }

    res.writeHead(404, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify({ error: 'Endpoint não encontrado', pathname }));

  } catch (erro) {
    console.error('[ERRO API GATEWAY]', erro);
    if (typeof res.status === 'function') {
      return res.status(500).json({
        error: 'Erro interno ao processar requisição na API',
        detalhes: erro.message
      });
    }
    res.writeHead(500, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify({ error: 'Erro interno ao processar requisição na API', detalhes: erro.message }));
  }
}
