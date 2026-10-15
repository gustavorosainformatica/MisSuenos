/**
 * Vercel Serverless Function: /api/clientes
 * Suporta GET (listar/buscar), POST (criar), PUT (atualizar)
 * Persistência unificada via lib/db.js (Turso Cloud ou SQLite Local)
 * Auditoria integrada no próprio banco de dados
 */

import { query, get, run, registrarLog } from '../lib/db.js';

function responder(res, status, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(data);
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseUrl(req) {
  return new URL(req.url, 'http://localhost');
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return res.status(204).end();
    }
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const url = parseUrl(req);
  const idParam = url.searchParams.get('id') || req.query?.id;

  // 1. GET /api/clientes
  if (req.method === 'GET') {
    try {
      // Se tiver ID, retorna cliente único
      if (idParam) {
        const id = parseInt(idParam, 10);
        const cliente = await get('SELECT * FROM clientes WHERE id = ?', [id]);
        if (!cliente) return responder(res, 404, { error: 'Cliente não encontrado' });
        return responder(res, 200, cliente);
      }

      // Se tiver busca ou UF
      const uf = url.searchParams.get('uf') || req.query?.uf;
      const busca = url.searchParams.get('q') || req.query?.q;

      let sql = 'SELECT * FROM clientes WHERE 1=1';
      const params = [];

      if (uf) {
        sql += ' AND uf = ?';
        params.push(uf.toUpperCase());
      }
      if (busca) {
        sql += ' AND (nome LIKE ? OR apelido_referencia LIKE ? OR cidade LIKE ? OR cpf_limpo LIKE ? OR cnpj_limpo LIKE ?)';
        const termo = `%${busca}%`;
        params.push(termo, termo, termo, termo, termo);
      }

      sql += ' ORDER BY nome ASC';
      const clientes = await query(sql, params);
      return responder(res, 200, clientes);
    } catch (err) {
      console.error('[API CLIENTES GET ERRO]', err);
      return responder(res, 500, { error: 'Erro ao consultar clientes: ' + err.message });
    }
  }

  // 2. PUT /api/clientes (Atualização de cliente com auditoria)
  if (req.method === 'PUT') {
    try {
      const payload = await parseBody(req);
      const id = parseInt(idParam || payload.id, 10);

      if (!id) {
        return responder(res, 400, { error: 'ID do cliente é obrigatório para atualização.' });
      }

      const clienteAntigo = await get('SELECT * FROM clientes WHERE id = ?', [id]);
      if (!clienteAntigo) {
        return responder(res, 404, { error: 'Cliente não encontrado' });
      }

      // Campos alterados
      const camposAlterados = [];
      const monitorados = [
        'nome', 'apelido_referencia', 'razao_social', 'cpf', 'cnpj', 'ie',
        'telefone', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep', 'observacoes'
      ];
      monitorados.forEach(c => {
        const vAntigo = (clienteAntigo[c] || '').toString().trim();
        const vNovo = (payload[c] || '').toString().trim();
        if (vAntigo !== vNovo) camposAlterados.push(c);
      });

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

      const sqlUpdate = `
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
      `;

      await run(sqlUpdate, [
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
      ]);

      const clienteAtualizado = await get('SELECT * FROM clientes WHERE id = ?', [id]);

      // Registra log de auditoria no próprio banco
      const tipoAcao = camposAlterados.some(c => ['cpf', 'cnpj', 'telefone', 'numero'].includes(c))
        ? 'COMPLETOU_DADOS'
        : 'EDICAO_CADASTRO';

      await registrarLog({
        clienteId: id,
        clienteNome: clienteAtualizado.nome,
        tipoAcao: tipoAcao,
        camposAlterados: camposAlterados,
        detalhes: camposAlterados.length > 0 ? `Campos: ${camposAlterados.join(', ')}` : 'Sem mudanças',
        req: req
      });

      return responder(res, 200, {
        success: true,
        message: 'Cliente atualizado e log gravado com sucesso!',
        cliente: clienteAtualizado,
        camposAlterados: camposAlterados
      });
    } catch (err) {
      console.error('[API CLIENTES PUT ERRO]', err);
      return responder(res, 500, { error: 'Erro ao atualizar: ' + err.message });
    }
  }

  // 3. POST /api/clientes (Cadastro de novo cliente)
  if (req.method === 'POST') {
    try {
      const payload = await parseBody(req);

      if (!payload.nome || !payload.nome.trim()) {
        return responder(res, 400, { error: 'O nome do cliente é obrigatório.' });
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

      const sqlInsert = `
        INSERT INTO clientes (
          nome, apelido_referencia, razao_social,
          cpf, cpf_limpo, cnpj, cnpj_limpo, ie,
          telefone, telefone_limpo,
          logradouro, numero, complemento, bairro,
          cidade, uf, cep, cep_limpo,
          endereco_completo, observacoes, arquivo_origem, data_cadastro
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const resultado = await run(sqlInsert, [
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
      ]);

      const novoId = resultado.lastInsertRowid;
      const novoCliente = await get('SELECT * FROM clientes WHERE id = ?', [novoId]);

      await registrarLog({
        clienteId: novoId,
        clienteNome: novoCliente.nome,
        tipoAcao: 'NOVO_CADASTRO',
        camposAlterados: ['cadastro_completo'],
        detalhes: `Novo cliente cadastrado em ${novoCliente.cidade}/${novoCliente.uf}`,
        req: req
      });

      return responder(res, 201, {
        success: true,
        message: 'Novo cliente cadastrado com sucesso!',
        id: novoId,
        cliente: novoCliente
      });
    } catch (err) {
      console.error('[API CLIENTES POST ERRO]', err);
      return responder(res, 500, { error: 'Erro ao cadastrar: ' + err.message });
    }
  }

  return responder(res, 405, { error: 'Método não permitido' });
}
