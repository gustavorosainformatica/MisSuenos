#!/usr/bin/env node
/**
 * Servidor Web Local e API REST para o Painel de Clientes Mis Sueños
 * Autor: Gustavo Rosa Informática
 * Suporte a CRUD completo, persistência em SQLite nativo (node:sqlite),
 * sincronização em tempo real e REGISTRO DE AUDITORIA/LOGS NO BANCO.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import handlerAnexos from '../api/anexos.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const BASE_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(BASE_DIR, 'public');
const DB_DIR = path.join(BASE_DIR, 'database');
const DB_PATH = path.join(DB_DIR, 'clientes.db');

// Inicializa conexão SQLite e garante tabela de logs
let db = null;
try {
  if (fs.existsSync(DB_PATH)) {
    db = new DatabaseSync(DB_PATH);
    console.log(`[BANCO] Conexão ativa com SQLite: ${DB_PATH}`);

    // Cria tabela de logs no próprio banco se ainda não existir
    db.exec(`
      CREATE TABLE IF NOT EXISTS logs_auditoria (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER,
        cliente_nome TEXT,
        tipo_acao TEXT NOT NULL,
        campos_alterados TEXT,
        detalhes TEXT,
        ip_origem TEXT,
        user_agent TEXT,
        data_hora TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_logs_cliente ON logs_auditoria (cliente_id);
      CREATE INDEX IF NOT EXISTS idx_logs_data ON logs_auditoria (data_hora);

      CREATE TABLE IF NOT EXISTS arquivos_anexos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER,
        cliente_nome TEXT,
        tipo_documento TEXT NOT NULL,
        titulo TEXT,
        nome_arquivo TEXT NOT NULL,
        tamanho_bytes INTEGER,
        mimetype TEXT,
        storage_provedor TEXT NOT NULL,
        storage_key TEXT NOT NULL,
        url TEXT NOT NULL,
        observacoes TEXT,
        data_upload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_anexos_cliente ON arquivos_anexos (cliente_id);
      CREATE INDEX IF NOT EXISTS idx_anexos_tipo ON arquivos_anexos (tipo_documento);

      CREATE TABLE IF NOT EXISTS produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_sku TEXT UNIQUE,
        nome TEXT NOT NULL,
        categoria TEXT NOT NULL,
        unidade_medida TEXT DEFAULT 'UN',
        preco_custo REAL DEFAULT 0,
        preco_venda REAL NOT NULL DEFAULT 0,
        estoque_atual REAL NOT NULL DEFAULT 0,
        estoque_minimo REAL DEFAULT 5,
        descricao TEXT,
        ativo INTEGER DEFAULT 1,
        is_teste INTEGER DEFAULT 0,
        data_cadastro TEXT NOT NULL,
        data_atualizacao TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos (categoria);
      CREATE INDEX IF NOT EXISTS idx_produtos_sku ON produtos (codigo_sku);
      CREATE INDEX IF NOT EXISTS idx_produtos_nome ON produtos (nome);
    `);
  }
} catch (err) {
  console.error('[BANCO ERRO] Falha ao conectar ao SQLite:', err);
}

/**
 * Função para registrar log de auditoria diretamente no banco de dados
 */
function registrarLog({ clienteId, clienteNome, tipoAcao, camposAlterados, detalhes, req }) {
  if (!db) return;
  try {
    const ip = req?.headers['x-forwarded-for'] || req?.socket?.remoteAddress || '127.0.0.1';
    const userAgent = (req?.headers['user-agent'] || 'Navegador Web').slice(0, 200);
    const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const stmt = db.prepare(`
      INSERT INTO logs_auditoria (
        cliente_id, cliente_nome, tipo_acao, campos_alterados, detalhes, ip_origem, user_agent, data_hora
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      clienteId || null,
      clienteNome || 'Cliente',
      tipoAcao,
      Array.isArray(camposAlterados) ? camposAlterados.join(', ') : (camposAlterados || ''),
      detalhes || '',
      ip,
      userAgent,
      dataHora
    );

    console.log(`[LOG REGISTRADO] ${tipoAcao} | Cliente #${clienteId} (${clienteNome}) em ${dataHora}`);
  } catch (err) {
    console.error('[ERRO AO GRAVAR LOG]', err);
  }
}

/**
 * Função utilitária para ler corpo da requisição (JSON)
 */
function lerCorpoJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error('Tamanho máximo excedido'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Sincroniza arquivos secundários (JSON, CSV e JS offline)
 */
function sincronizarArquivosSecundarios() {
  if (!db) return;
  try {
    const todos = db.prepare('SELECT * FROM clientes ORDER BY nome ASC').all();

    // 1. clientes.json
    fs.writeFileSync(path.join(DB_DIR, 'clientes.json'), JSON.stringify(todos, null, 2), 'utf-8');

    // 2. dados_clientes.js (para suporte offline via dois cliques no Windows)
    const jsContent = `/**\n * Base de Clientes Mis Sueños (Offline)\n * Atualizado em: ${new Date().toISOString()}\n */\nwindow.CLIENTES_DATA = ${JSON.stringify(todos, null, 2)};\n`;
    fs.writeFileSync(path.join(PUBLIC_DIR, 'dados_clientes.js'), jsContent, 'utf-8');

    // 3. clientes.csv
    if (todos.length > 0) {
      const colunas = Object.keys(todos[0]);
      let csv = '\uFEFF' + colunas.join(';') + '\n';
      todos.forEach(cli => {
        const linha = colunas.map(c => `"${(cli[c] ?? '').toString().replace(/"/g, '""')}"`).join(';');
        csv += linha + '\n';
      });
      fs.writeFileSync(path.join(DB_DIR, 'clientes.csv'), csv, 'utf-8');
    }

    console.log(`[SYNC] Arquivos sincronizados com sucesso (${todos.length} registros).`);
  } catch (err) {
    console.error('[SYNC ERRO] Erro ao sincronizar arquivos:', err);
  }
}

/**
 * Resposta JSON padronizada com cabeçalhos CORS
 */
function responderJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method;

  // Lida com requisições preflight do CORS
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // ====================================================================
  // ROTAS DA API REST
  // ====================================================================

  // ROTA 1: Listar Todos os Clientes
  if (pathname === '/api/clientes' && method === 'GET') {
    if (db) {
      try {
        const clientes = db.prepare('SELECT * FROM clientes ORDER BY nome ASC').all();
        return responderJson(res, 200, clientes);
      } catch (e) {
        console.error('Erro na consulta SQLite:', e);
      }
    }

    // Fallback: Lê do JSON se o SQLite não estiver disponível
    const jsonPath = path.join(DB_DIR, 'clientes.json');
    if (fs.existsSync(jsonPath)) {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      return responderJson(res, 200, data);
    }
    return responderJson(res, 404, { error: 'Base de dados não encontrada' });
  }

  // ====================================================================
  // ROTAS DE PRODUTOS & ESTOQUE DE COUROS (ERP)
  // ====================================================================

  // ROTA PRODUTOS 1: Listar Produtos (com filtros de categoria e busca)
  if (pathname === '/api/produtos' && method === 'GET') {
    try {
      const q = url.searchParams.get('q');
      const categoria = url.searchParams.get('categoria');

      if (db) {
        let sql = 'SELECT * FROM produtos WHERE ativo = 1';
        const params = [];
        if (categoria && categoria !== 'TODAS') {
          sql += ' AND categoria = ?';
          params.push(categoria);
        }
        if (q) {
          sql += ' AND (nome LIKE ? OR codigo_sku LIKE ? OR descricao LIKE ?)';
          const termo = `%${q}%`;
          params.push(termo, termo, termo);
        }
        sql += ' ORDER BY categoria ASC, nome ASC';
        const produtos = db.prepare(sql).all(...params);
        return responderJson(res, 200, produtos);
      }
      return responderJson(res, 200, []);
    } catch (e) {
      console.error('[ERRO PRODUTOS GET]', e);
      return responderJson(res, 500, { error: 'Falha ao buscar produtos: ' + e.message });
    }
  }

  // ROTA PRODUTOS 2: Cadastrar Novo Produto
  if (pathname === '/api/produtos' && method === 'POST') {
    try {
      const payload = await lerCorpoJson(req);
      if (!payload.nome) {
        return responderJson(res, 400, { error: 'O nome do produto é obrigatório.' });
      }

      const agora = new Date().toISOString();
      const sku = (payload.codigo_sku && payload.codigo_sku.trim()) || `SKU-${Date.now().toString().slice(-6)}`;
      const categoria = payload.categoria || 'Outros';
      const un = payload.unidade_medida || 'UN';
      const custo = parseFloat(payload.preco_custo || 0);
      const venda = parseFloat(payload.preco_venda || 0);
      const estoque = parseFloat(payload.estoque_atual || 0);
      const estoqueMin = parseFloat(payload.estoque_minimo || 5);
      const desc = payload.descricao || '';

      if (db) {
        const stmt = db.prepare(`
          INSERT INTO produtos (
            codigo_sku, nome, categoria, unidade_medida,
            preco_custo, preco_venda, estoque_atual, estoque_minimo,
            descricao, ativo, data_cadastro
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `);

        const info = stmt.run(sku, payload.nome.trim(), categoria, un, custo, venda, estoque, estoqueMin, desc, agora);

        registrarLog({
          clienteId: null,
          clienteNome: 'Estoque / Produtos',
          tipoAcao: 'CADASTRO_PRODUTO',
          camposAlterados: ['produto_criado'],
          detalhes: `Produto ${payload.nome} (${sku}) cadastrado no estoque com ${estoque} ${un} (R$ ${venda.toFixed(2)})`,
          req
        });

        return responderJson(res, 201, {
          success: true,
          id: Number(info.lastInsertRowid),
          codigo_sku: sku,
          nome: payload.nome
        });
      }
      return responderJson(res, 500, { error: 'Banco SQLite indisponível' });
    } catch (e) {
      console.error('[ERRO PRODUTOS POST]', e);
      return responderJson(res, 500, { error: 'Falha ao cadastrar produto: ' + e.message });
    }
  }

  // ROTA PRODUTOS 3: Buscar / Atualizar / Excluir Produto por ID (/api/produtos/:id)
  const matchIdProduto = pathname.match(/^\/api\/produtos\/(\d+)$/);
  if (matchIdProduto) {
    const idProd = parseInt(matchIdProduto[1], 10);

    if (method === 'GET') {
      if (db) {
        const row = db.prepare('SELECT * FROM produtos WHERE id = ?').get(idProd);
        if (row) return responderJson(res, 200, row);
        return responderJson(res, 404, { error: 'Produto não encontrado' });
      }
    }

    if (method === 'PUT' || method === 'POST') {
      try {
        const payload = await lerCorpoJson(req);
        const agora = new Date().toISOString();

        if (db) {
          const stmt = db.prepare(`
            UPDATE produtos SET
              codigo_sku = ?,
              nome = ?,
              categoria = ?,
              unidade_medida = ?,
              preco_custo = ?,
              preco_venda = ?,
              estoque_atual = ?,
              estoque_minimo = ?,
              descricao = ?,
              data_atualizacao = ?
            WHERE id = ?
          `);

          stmt.run(
            payload.codigo_sku,
            payload.nome,
            payload.categoria,
            payload.unidade_medida || 'UN',
            parseFloat(payload.preco_custo || 0),
            parseFloat(payload.preco_venda || 0),
            parseFloat(payload.estoque_atual || 0),
            parseFloat(payload.estoque_minimo || 5),
            payload.descricao || '',
            agora,
            idProd
          );

          registrarLog({
            clienteId: null,
            clienteNome: 'Estoque / Produtos',
            tipoAcao: 'EDICAO_PRODUTO',
            camposAlterados: ['produto_atualizado'],
            detalhes: `Produto #${idProd} (${payload.nome}) atualizado`,
            req
          });

          return responderJson(res, 200, { success: true, id: idProd });
        }
      } catch (e) {
        console.error('[ERRO PRODUTOS PUT]', e);
        return responderJson(res, 500, { error: 'Falha ao atualizar produto: ' + e.message });
      }
    }

    if (method === 'DELETE') {
      try {
        if (db) {
          db.prepare('UPDATE produtos SET ativo = 0 WHERE id = ?').run(idProd);

          registrarLog({
            clienteId: null,
            clienteNome: 'Estoque / Produtos',
            tipoAcao: 'EXCLUSAO_PRODUTO',
            camposAlterados: ['ativo'],
            detalhes: `Produto #${idProd} inativado do catálogo`,
            req
          });

          return responderJson(res, 200, { success: true, id: idProd });
        }
      } catch (e) {
        console.error('[ERRO PRODUTOS DELETE]', e);
        return responderJson(res, 500, { error: 'Falha ao inativar produto: ' + e.message });
      }
    }
  }

  // ROTA 2: Consultar Logs de Auditoria do Banco (Geral)
  if (pathname === '/api/logs' && method === 'GET') {
    if (db) {
      try {
        const logs = db.prepare('SELECT * FROM logs_auditoria ORDER BY id DESC LIMIT 100').all();
        return responderJson(res, 200, logs);
      } catch (e) {
        console.error('Erro ao ler logs de auditoria:', e);
      }
    }
    return responderJson(res, 200, []);
  }

  // ROTA 3: Logs de um Cliente Específico (/api/clientes/:id/logs)
  const matchLogsCliente = pathname.match(/^\/api\/clientes\/(\d+)\/logs$/);
  if (matchLogsCliente && method === 'GET') {
    const id = parseInt(matchLogsCliente[1], 10);
    if (db) {
      const logsCliente = db.prepare('SELECT * FROM logs_auditoria WHERE cliente_id = ? ORDER BY id DESC').all(id);
      return responderJson(res, 200, logsCliente);
    }
    return responderJson(res, 200, []);
  }

  // ROTA 4: Buscar Cliente por ID
  const matchId = pathname.match(/^\/api\/clientes\/(\d+)$/);
  if (matchId && method === 'GET') {
    const id = parseInt(matchId[1], 10);
    if (db) {
      const row = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
      if (row) return responderJson(res, 200, row);
      return responderJson(res, 404, { error: 'Cliente não encontrado' });
    }
  }

  // ROTA 5: Atualizar / Completar Cadastro do Cliente (PUT ou POST /api/clientes/:id)
  if (matchId && (method === 'PUT' || method === 'POST')) {
    const id = parseInt(matchId[1], 10);
    try {
      const payload = await lerCorpoJson(req);

      if (!db) {
        return responderJson(res, 500, { error: 'Banco de dados SQLite indisponível' });
      }

      // Valida existência e busca estado anterior para auditoria
      const clienteAntigo = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
      if (!clienteAntigo) {
        return responderJson(res, 404, { error: 'Cliente não encontrado' });
      }

      // Identifica quais campos mudaram
      const camposAlterados = [];
      const camposMonitorados = [
        'nome', 'apelido_referencia', 'razao_social', 'cpf', 'cnpj', 'ie',
        'telefone', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep', 'observacoes'
      ];
      camposMonitorados.forEach(c => {
        const valAntigo = (clienteAntigo[c] || '').toString().trim();
        const valNovo = (payload[c] || '').toString().trim();
        if (valAntigo !== valNovo) {
          camposAlterados.push(c);
        }
      });

      // Limpeza de campos
      const cpfLimpo = (payload.cpf || '').replace(/\D/g, '');
      const cnpjLimpo = (payload.cnpj || '').replace(/\D/g, '');
      const telefoneLimpo = (payload.telefone || '').replace(/\D/g, '');
      const cepLimpo = (payload.cep || '').replace(/\D/g, '');

      // Constrói endereço completo formatado
      const partesEnd = [
        payload.logradouro,
        payload.numero ? `nº ${payload.numero}` : '',
        payload.complemento ? `(${payload.complemento})` : '',
        payload.bairro ? `- ${payload.bairro}` : '',
        payload.cidade ? `- ${payload.cidade}/${payload.uf || ''}` : '',
        payload.cep ? `- CEP ${payload.cep}` : ''
      ].filter(Boolean);
      const enderecoFormatado = partesEnd.join(' ') || payload.endereco_completo || '';

      const stmt = db.prepare(`
        UPDATE clientes SET
          nome = ?,
          apelido_referencia = ?,
          razao_social = ?,
          cpf = ?,
          cpf_limpo = ?,
          cnpj = ?,
          cnpj_limpo = ?,
          ie = ?,
          telefone = ?,
          telefone_limpo = ?,
          logradouro = ?,
          numero = ?,
          complemento = ?,
          bairro = ?,
          cidade = ?,
          uf = ?,
          cep = ?,
          cep_limpo = ?,
          endereco_completo = ?,
          observacoes = ?
        WHERE id = ?
      `);

      stmt.run(
        payload.nome || '',
        payload.apelido_referencia || '',
        payload.razao_social || '',
        payload.cpf || '',
        cpfLimpo,
        payload.cnpj || '',
        cnpjLimpo,
        payload.ie || '',
        payload.telefone || '',
        telefoneLimpo,
        payload.logradouro || '',
        payload.numero || '',
        payload.complemento || '',
        payload.bairro || '',
        payload.cidade || '',
        (payload.uf || '').toUpperCase(),
        payload.cep || '',
        cepLimpo,
        enderecoFormatado,
        payload.observacoes || '',
        id
      );

      const clienteAtualizado = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);

      // REGISTRA O LOG NO PRÓPRIO BANCO DE DADOS
      const tipoAcao = camposAlterados.some(c => ['cpf', 'cnpj', 'telefone', 'numero'].includes(c))
        ? 'COMPLETOU_DADOS'
        : 'EDICAO_CADASTRO';

      const detalhes = camposAlterados.length > 0
        ? `Campos atualizados: ${camposAlterados.join(', ')}`
        : 'Sem alteração de valores';

      registrarLog({
        clienteId: id,
        clienteNome: clienteAtualizado.nome,
        tipoAcao: tipoAcao,
        camposAlterados: camposAlterados,
        detalhes: detalhes,
        req: req
      });

      // Sincroniza arquivos em background
      sincronizarArquivosSecundarios();

      return responderJson(res, 200, {
        success: true,
        message: 'Cadastro de cliente atualizado e log gravado com sucesso!',
        cliente: clienteAtualizado,
        camposAlterados: camposAlterados
      });
    } catch (e) {
      console.error('[ERRO ATUALIZAÇÃO]', e);
      return responderJson(res, 500, { error: 'Falha ao atualizar cliente: ' + e.message });
    }
  }

  // ROTA 6: Criar Novo Cliente (POST /api/clientes)
  if (pathname === '/api/clientes' && method === 'POST') {
    try {
      const payload = await lerCorpoJson(req);

      if (!payload.nome || !payload.nome.trim()) {
        return responderJson(res, 400, { error: 'O nome do cliente é obrigatório.' });
      }

      if (!db) {
        return responderJson(res, 500, { error: 'Banco de dados SQLite indisponível' });
      }

      const cpfLimpo = (payload.cpf || '').replace(/\D/g, '');
      const cnpjLimpo = (payload.cnpj || '').replace(/\D/g, '');
      const telefoneLimpo = (payload.telefone || '').replace(/\D/g, '');
      const cepLimpo = (payload.cep || '').replace(/\D/g, '');

      const partesEnd = [
        payload.logradouro,
        payload.numero ? `nº ${payload.numero}` : '',
        payload.complemento ? `(${payload.complemento})` : '',
        payload.bairro ? `- ${payload.bairro}` : '',
        payload.cidade ? `- ${payload.cidade}/${payload.uf || ''}` : '',
        payload.cep ? `- CEP ${payload.cep}` : ''
      ].filter(Boolean);
      const enderecoFormatado = partesEnd.join(' ') || payload.endereco_completo || '';
      const dataHoje = new Date().toISOString().split('T')[0];

      const stmt = db.prepare(`
        INSERT INTO clientes (
          nome, apelido_referencia, razao_social,
          cpf, cpf_limpo, cnpj, cnpj_limpo, ie,
          telefone, telefone_limpo,
          logradouro, numero, complemento, bairro,
          cidade, uf, cep, cep_limpo,
          endereco_completo, observacoes, arquivo_origem, data_cadastro
        ) VALUES (
          ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?
        )
      `);

      const resultado = stmt.run(
        payload.nome.trim(),
        payload.apelido_referencia || '',
        payload.razao_social || '',
        payload.cpf || '',
        cpfLimpo,
        payload.cnpj || '',
        cnpjLimpo,
        payload.ie || '',
        payload.telefone || '',
        telefoneLimpo,
        payload.logradouro || '',
        payload.numero || '',
        payload.complemento || '',
        payload.bairro || '',
        payload.cidade || '',
        (payload.uf || 'RS').toUpperCase(),
        payload.cep || '',
        cepLimpo,
        enderecoFormatado,
        payload.observacoes || '',
        payload.arquivo_origem || 'CADASTRO_MANUAL.docx',
        dataHoje
      );

      const novoId = resultado.lastInsertRowid;
      const novoCliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(novoId);

      // REGISTRA O LOG DE CRIAÇÃO NO BANCO
      registrarLog({
        clienteId: novoId,
        clienteNome: novoCliente.nome,
        tipoAcao: 'NOVO_CADASTRO',
        camposAlterados: ['cadastro_completo'],
        detalhes: `Novo cliente cadastrado manualmente via web em ${novoCliente.cidade}/${novoCliente.uf}`,
        req: req
      });

      // Sincroniza em background
      sincronizarArquivosSecundarios();

      return responderJson(res, 201, {
        success: true,
        message: 'Novo cliente cadastrado e log gravado com sucesso!',
        id: novoId,
        cliente: novoCliente
      });
    } catch (e) {
      console.error('[ERRO CADASTRO]', e);
      return responderJson(res, 500, { error: 'Falha ao cadastrar cliente: ' + e.message });
    }
  }

  // ROTA 8: Emissão e Exportação Fiscal (NFS-e Portal Nacional e NF-e SEFAZ)
  if (pathname === '/api/nfe' && method === 'POST') {
    try {
      const payload = await lerCorpoJson(req);
      const { tipoNota, cliente, servico, produtos, valores, emitente } = payload;

      if (!tipoNota || !cliente) {
        return responderJson(res, 400, { error: 'tipoNota e cliente são obrigatórios.' });
      }

      const agora = new Date();
      const dataHoraIso = agora.toISOString();
      const dataHoraBR = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      // NFS-e: PORTAL NACIONAL DA RECEITA FEDERAL
      if (tipoNota === 'NFSE_SERVICO') {
        const valorServico = parseFloat(valores?.valorTotal || servico?.valor || 0);
        const docTomador = (cliente.cpf || cliente.cnpj || '').replace(/\D/g, '');
        const tipoDocTomador = docTomador.length > 11 ? 'CNPJ' : 'CPF';
        const cnae = servico?.cnae || '9511-8/00';
        const codigoTributacao = servico?.codigoTributacao || '01.07.01';
        const discriminacao = servico?.discriminacao || 'Prestação de serviços artesanais em couro e peles.';
        const numeroDps = Math.floor(100000 + Math.random() * 900000);
        const serieDps = '1';

        const xmlDps = `<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infDPS id="DPS${numeroDps}">
    <tpAmb>1</tpAmb>
    <dhEmi>${dataHoraIso}</dhEmi>
    <verAplic>1.0.0</verAplic>
    <serie>${serieDps}</serie>
    <nDPS>${numeroDps}</nDPS>
    <dCompet>${agora.toISOString().split('T')[0]}</dCompet>
    <tpEmit>1</tpEmit>
    <prest>
      <CNPJ>${(emitente?.cnpj || '00000000000191').replace(/\D/g, '')}</CNPJ>
      <xNome>${emitente?.razaoSocial || 'MIS SUEÑOS COUROS & PELES'}</xNome>
      <end>
        <xLgr>${emitente?.logradouro || 'Rua das Indústrias'}</xLgr>
        <nro>${emitente?.numero || '100'}</nro>
        <xBairro>${emitente?.bairro || 'Centro'}</xBairro>
        <cMun>4314902</cMun>
        <UF>${emitente?.uf || 'RS'}</UF>
        <CEP>${(emitente?.cep || '90000000').replace(/\D/g, '')}</CEP>
      </end>
    </prest>
    <toma>
      <${tipoDocTomador}>${docTomador}</${tipoDocTomador}>
      <xNome>${cliente.nome}</xNome>
      <end>
        <xLgr>${cliente.logradouro || ''}</xLgr>
        <nro>${cliente.numero || 'S/N'}</nro>
        <xBairro>${cliente.bairro || ''}</xBairro>
        <cMun>${cliente.codigoIbge || '4314902'}</cMun>
        <xMun>${cliente.cidade || ''}</xMun>
        <UF>${cliente.uf || 'RS'}</UF>
        <CEP>${(cliente.cep || '').replace(/\D/g, '')}</CEP>
      </end>
      <fone>${(cliente.telefone || '').replace(/\D/g, '')}</fone>
    </toma>
    <serv>
      <cLocPrestacao>4314902</cLocPrestacao>
      <cTribNac>${codigoTributacao}</cTribNac>
      <CNAE>${cnae.replace(/\D/g, '')}</CNAE>
      <xDescServ>${discriminacao}</xDescServ>
    </serv>
    <valores>
      <vServPrest>${valorServico.toFixed(2)}</vServPrest>
      <trib>
        <tribMun>
          <tribISSQN>1</tribISSQN>
          <cPaisResult>1058</cPaisResult>
          <tpRetISSQN>1</tpRetISSQN>
        </tribMun>
      </trib>
    </valores>
  </infDPS>
</DPS>`;

        registrarLog({
          clienteId: cliente.id || null,
          clienteNome: cliente.nome,
          tipoAcao: 'EMISSAO_NFSE_SERVICO',
          camposAlterados: ['dps_gerada', 'valor', 'servico'],
          detalhes: `NFS-e Portal Nacional | DPS #${numeroDps} | R$ ${valorServico.toFixed(2)} | ${discriminacao.slice(0, 45)}`,
          req: req
        });

        return responderJson(res, 200, {
          success: true,
          tipoNota: 'NFSE_SERVICO',
          numeroDps,
          serieDps,
          dataEmissao: dataHoraBR,
          valorTotal: valorServico,
          xmlDps,
          resumoPortalNacional: {
            orgao: 'Receita Federal do Brasil (Portal Nacional da NFS-e)',
            linkPortal: 'https://www.nfse.gov.br/EmissorNacional/',
            tomador: cliente.nome,
            documento: docTomador,
            cnae: cnae,
            codigoTributacao: codigoTributacao,
            discriminacao: discriminacao,
            valor: valorServico.toFixed(2)
          }
        });
      }

      // NF-e: SEFAZ PRODUTOS (MODELO 55)
      if (tipoNota === 'NFE_PRODUTO') {
        const valorProdutos = parseFloat(valores?.valorTotal || 0);
        const numeroNfe = Math.floor(1000 + Math.random() * 9000);
        const serieNfe = '1';
        const emitNome = emitente?.razaoSocial || 'MIS SUEÑOS COUROS & PELES';
        const emitCnpj = (emitente?.cnpj || '00000000000191').replace(/\D/g, '');

        const txtSefaz = [
          'NOTAFISCAL|1',
          `A|4.00|NFe|`,
          `B|43|${numeroNfe}|Venda de Mercadorias (Couros e Loncas)|0|55|${serieNfe}|${numeroNfe}|${agora.toISOString().slice(0, 10)}||1|1|4314902|1|1||1|1|3|1|0|0|||`,
          `C|${emitNome}|${emitNome}|||||3|`,
          `C02|${emitCnpj}|`,
          `E|${cliente.nome}|9|||||`,
          `E02|${(cliente.cpf || cliente.cnpj || '').replace(/\D/g, '')}|`,
          `E05|${cliente.logradouro || ''}|${cliente.numero || 'S/N'}|${cliente.complemento || ''}|${cliente.bairro || ''}|4314902|${cliente.cidade || ''}|${cliente.uf || 'RS'}|${(cliente.cep || '').replace(/\D/g, '')}|1058|BRASIL||`,
          `W|`,
          `W02|0.00|0.00|0.00|0.00|${valorProdutos.toFixed(2)}|0.00|0.00|0.00|0.00|0.00|0.00|0.00|0.00|${valorProdutos.toFixed(2)}|`
        ].join('\r\n');

        registrarLog({
          clienteId: cliente.id || null,
          clienteNome: cliente.nome,
          tipoAcao: 'EMISSAO_NFE_PRODUTO',
          camposAlterados: ['txt_sefaz', 'valor'],
          detalhes: `NF-e de Produtos SEFAZ | NF #${numeroNfe} | R$ ${valorProdutos.toFixed(2)}`,
          req: req
        });

        return responderJson(res, 200, {
          success: true,
          tipoNota: 'NFE_PRODUTO',
          numeroNfe,
          serieNfe,
          dataEmissao: dataHoraBR,
          valorTotal: valorProdutos,
          txtSefaz,
          resumoSefaz: {
            modelo: 'NF-e Modelo 55 (Produtos)',
            orgao: 'SEFAZ Estadual (RS)',
            destinatario: cliente.nome,
            documento: cliente.cpf || cliente.cnpj,
            valor: valorProdutos.toFixed(2)
          }
        });
      }

      return responderJson(res, 400, { error: 'Tipo de nota inválido.' });
    } catch (e) {
      console.error('[ERRO NFE]', e);
      return responderJson(res, 500, { error: 'Falha ao processar nota fiscal: ' + e.message });
    }
  }

  // ROTA 8.5: Anexos e Mídia (Cloudflare R2 / Fallback Local)
  if (pathname === '/api/anexos') {
    return handlerAnexos(req, res);
  }

  // ROTA 9: Download de Exportações (CSV e JSON)
  if (pathname === '/api/download/csv') {
    const csvPath = path.join(DB_DIR, 'clientes.csv');
    if (fs.existsSync(csvPath)) {
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="clientes_missuenos.csv"'
      });
      return fs.createReadStream(csvPath).pipe(res);
    }
  }

  if (pathname === '/api/download/json') {
    const jsonPath = path.join(DB_DIR, 'clientes.json');
    if (fs.existsSync(jsonPath)) {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="clientes_missuenos.json"'
      });
      return fs.createReadStream(jsonPath).pipe(res);
    }
  }



  // ====================================================================
  // SERVIR ARQUIVOS ESTÁTICOS DA PASTA PUBLIC
  // ====================================================================
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Página não encontrada');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8'
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`\n======================================================================`);
  console.log(`  PAINEL WEB & API REST DE CLIENTES MIS SUEÑOS`);
  console.log(`======================================================================`);
  console.log(`  Servidor rodando em: http://localhost:${PORT}`);
  console.log(`  Endpoints REST Ativos:`);
  console.log(`    GET    /api/clientes        -> Listar todos`);
  console.log(`    GET    /api/clientes/:id    -> Obter cliente por ID`);
  console.log(`    PUT    /api/clientes/:id    -> Atualizar/completar dados (com LOG)`);
  console.log(`    POST   /api/clientes        -> Inserir novo cliente (com LOG)`);
  console.log(`    GET    /api/logs            -> Histórico de logs de auditoria`);
  console.log(`    GET    /api/clientes/:id/logs -> Histórico de um cliente`);
  console.log(`======================================================================\n`);
});
