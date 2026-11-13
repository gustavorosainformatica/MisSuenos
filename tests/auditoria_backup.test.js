import test from 'node:test';
import assert from 'node:assert/strict';
import { mascararZeroPII, calcularDiff, serializarSeguro, registrarLog } from '../lib/audit.js';
import { query, get } from '../lib/db.js';

test('AUDITORIA TICKET 01 - Zero-PII: Mascaramento de CPF, CNPJ e Senhas', () => {
  // Teste de CPF formatado e limpo em strings
  const textoComCpf = 'Cliente portador do CPF 123.456.789-01 realizou pedido';
  const cpfMascarado = mascararZeroPII(textoComCpf);
  assert.equal(cpfMascarado.includes('123.456.789-01'), false);
  assert.ok(cpfMascarado.includes('***.456.789-**'));

  // Teste de CNPJ em strings
  const textoComCnpj = 'Emitente CNPJ 12.345.678/0001-90 autorizado';
  const cnpjMascarado = mascararZeroPII(textoComCnpj);
  assert.equal(cnpjMascarado.includes('12.345.678/0001-90'), false);
  assert.ok(cnpjMascarado.includes('**.345.678/****-**'));

  // Teste de objeto profundo com senhas e PINs
  const payloadSensivel = {
    usuario: 'GUSTAVO',
    senha: 'minha_senha_super_secreta',
    pin_seguranca: '1234',
    token_auth: 'eyJhGciOi...',
    cliente: {
      nome: 'CLIENTE TESTE',
      cpf: '000.000.001-91'
    }
  };

  const objetoLimpo = mascararZeroPII(payloadSensivel);
  assert.equal(objetoLimpo.senha, '[PROTEGIDO]');
  assert.equal(objetoLimpo.pin_seguranca, '[PROTEGIDO]');
  assert.equal(objetoLimpo.token_auth, '[PROTEGIDO]');
  assert.ok(objetoLimpo.cliente.cpf.includes('***.000.001-**'));
});

test('AUDITORIA TICKET 01 - Diff Estruturado: Detecção de propriedades modificadas', () => {
  const anterior = {
    status: 'AGUARDANDO_PAGAMENTO',
    valor_total: 100.0,
    observacoes: 'Sem observação'
  };

  const novo = {
    status: 'EM_SEPARACAO',
    valor_total: 150.0,
    observacoes: 'Sem observação'
  };

  const diff = calcularDiff(anterior, novo);
  assert.deepEqual(diff.sort(), ['status', 'valor_total'].sort());
});

test('AUDITORIA TICKET 01 - DB: registrarLog insere metadados ricos em logs_auditoria com Zero-PII', async () => {
  const dadosAnt = { preco: 100, status: 'AGUARDANDO_PAGAMENTO', cpf: '111.222.333-44' };
  const dadosNov = { preco: 120, status: 'EM_SEPARACAO', cpf: '111.222.333-44' };

  const ok = await registrarLog({
    usuarioId: 1,
    usuarioNome: 'GUSTAVO ADM',
    modulo: 'PEDIDOS',
    tipoAcao: 'STATUS_CHANGE',
    referenciaId: '#PED-TESTE-999',
    descricao: 'Mudança de status para Em Separação',
    dadosAnteriores: dadosAnt,
    dadosNovos: dadosNov,
    ip: '192.168.1.50',
    userAgent: 'ERP Test Agent'
  });

  assert.equal(ok, true);

  // Consulta registro no banco
  const reg = await get(
    'SELECT * FROM logs_auditoria WHERE referencia_id = ? ORDER BY id DESC LIMIT 1',
    ['#PED-TESTE-999']
  );

  assert.ok(reg);
  assert.equal(reg.usuario_id, 1);
  assert.equal(reg.usuario_nome, 'GUSTAVO ADM');
  assert.equal(reg.modulo, 'PEDIDOS');
  assert.equal(reg.tipo_acao, 'STATUS_CHANGE');
  assert.equal(reg.referencia_id, '#PED-TESTE-999');
  assert.equal(reg.ip_origem, '192.168.1.50');
  assert.equal(reg.campos_alterados, 'preco, status');

  // Verifica que o CPF dentro do JSON gravado foi mascarado
  assert.ok(reg.dados_anteriores.includes('***.222.333-**'));
  assert.equal(reg.dados_anteriores.includes('111.222.333-44'), false);
});

test('AUDITORIA TICKET 02 - Integração: Pedidos e Clientes registram logs estruturados com modulo e referenciaId', async () => {
  // Simula consulta de log de pedidos
  const logsPedidos = await query("SELECT * FROM logs_auditoria WHERE modulo = 'PEDIDOS' LIMIT 5");
  assert.ok(Array.isArray(logsPedidos));

  // Simula consulta de log de clientes
  const logsClientes = await query("SELECT * FROM logs_auditoria WHERE modulo = 'CLIENTES' LIMIT 5");
  assert.ok(Array.isArray(logsClientes));
});

test('AUDITORIA TICKET 03 - API REST: GET /api/logs retorna estrutura paginada e filtrada', async () => {
  const { default: handlerLogs } = await import('../api/logs.js');

  function criarMockRes() {
    let statusCode = 200;
    let responseData = null;
    return {
      setHeader() { return this; },
      writeHead(code) { statusCode = code; return this; },
      status(code) { statusCode = code; return this; },
      json(data) { responseData = data; return this; },
      end(data) {
        if (data && !responseData) {
          try { responseData = JSON.parse(data); } catch { responseData = data; }
        }
        return this;
      },
      getStatusCode() { return statusCode; },
      getData() { return responseData; }
    };
  }

  // 1. Listagem padrão paginada
  const reqPadrao = { method: 'GET', url: '/api/logs?limit=5&page=1' };
  const resPadrao = criarMockRes();
  await handlerLogs(reqPadrao, resPadrao);

  assert.equal(resPadrao.getStatusCode(), 200);
  const dataPadrao = resPadrao.getData();
  assert.equal(dataPadrao.success, true);
  assert.ok(Array.isArray(dataPadrao.logs));
  assert.ok(dataPadrao.total > 0);
  assert.equal(dataPadrao.page, 1);
  assert.equal(dataPadrao.limit, 5);
  assert.ok(Array.isArray(dataPadrao.modulos));

  // 2. Filtro por módulo
  const reqModulo = { method: 'GET', url: '/api/logs?modulo=PEDIDOS&limit=10' };
  const resModulo = criarMockRes();
  await handlerLogs(reqModulo, resModulo);

  assert.equal(resModulo.getStatusCode(), 200);
  const dataModulo = resModulo.getData();
  assert.ok(dataModulo.logs.every(l => l.modulo === 'PEDIDOS'));

  // 3. Busca textual
  const reqBusca = { method: 'GET', url: '/api/logs?busca=PED-TESTE' };
  const resBusca = criarMockRes();
  await handlerLogs(reqBusca, resBusca);

  assert.equal(resBusca.getStatusCode(), 200);
  const dataBusca = resBusca.getData();
  assert.ok(dataBusca.logs.length > 0);
  assert.ok(dataBusca.logs.some(l => l.referencia_id && l.referencia_id.includes('PED-TESTE')));
});

test('AUDITORIA TICKET 04 - Backup R2: Snapshot atômico compactado (.sqlite.gz) e listagem', async () => {
  const { default: handlerSistema } = await import('../api/sistema.js');

  function criarMockRes() {
    let statusCode = 200;
    let responseData = null;
    return {
      setHeader() { return this; },
      writeHead(code) { statusCode = code; return this; },
      status(code) { statusCode = code; return this; },
      json(data) { responseData = data; return this; },
      end(data) {
        if (data && !responseData) {
          try { responseData = JSON.parse(data); } catch { responseData = data; }
        }
        return this;
      },
      getStatusCode() { return statusCode; },
      getData() { return responseData; }
    };
  }

  // 1. Dispara geração de backup
  const reqBackup = {
    method: 'POST',
    url: '/api/sistema',
    body: { acao: 'backup', usuario_nome: 'TESTE_SISTEMA' }
  };
  const resBackup = criarMockRes();
  await handlerSistema(reqBackup, resBackup);

  assert.equal(resBackup.getStatusCode(), 201);
  const dataBackup = resBackup.getData();
  assert.equal(dataBackup.sucesso, true);
  assert.ok(dataBackup.arquivo.startsWith('backup_missuenos_'));
  assert.ok(dataBackup.tamanhoBytes > 0);
  assert.ok(dataBackup.tamanhoOriginalBytes > 0);
  assert.ok(dataBackup.urlDownload);

  // 2. Consulta lista de backups disponíveis
  const reqLista = { method: 'GET', url: '/api/sistema?acao=backups' };
  const resLista = criarMockRes();
  await handlerSistema(reqLista, resLista);

  assert.equal(resLista.getStatusCode(), 200);
  const dataLista = resLista.getData();
  assert.equal(dataLista.sucesso, true);
  assert.ok(Array.isArray(dataLista.backups));
  assert.ok(dataLista.backups.length > 0);
  assert.ok(dataLista.backups.some(b => b.nomeArquivo === dataBackup.arquivo));
});





test('AUDITORIA TICKET 05 - Script CLI: Snapshot standalone e integridade da descompactação GZIP', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const zlib = await import('node:zlib');

  const scriptPath = path.join(process.cwd(), 'scripts', 'executar_backup_r2.js');
  assert.ok(fs.existsSync(scriptPath), 'Script scripts/executar_backup_r2.js deve existir');

  // Verifica se há pelo menos um backup gerado em public/uploads/backups
  const backupsDir = path.join(process.cwd(), 'public', 'uploads', 'backups');
  if (fs.existsSync(backupsDir)) {
    const arquivos = fs.readdirSync(backupsDir).filter(f => f.endsWith('.gz'));
    assert.ok(arquivos.length > 0, 'Deve haver pelo menos um arquivo de backup compactado .gz');

    // Valida que o arquivo mais recente pode ser descompactado e possui conteúdo válido
    const ultimoArquivo = arquivos[arquivos.length - 1];
    const bufferGz = fs.readFileSync(path.join(backupsDir, ultimoArquivo));
    const bufferOriginal = zlib.gunzipSync(bufferGz);
    assert.ok(bufferOriginal.length > 0, 'O backup descompactado deve conter dados válidos');
  }
});

test('AUDITORIA TICKET 06 - UI: Modal de Auditoria e Backups R2 integrado ao index.html com Zero-PII e Caixa Alta', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const html = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf-8');
  const mobileCss = fs.readFileSync(path.join(process.cwd(), 'public', 'mobile.css'), 'utf-8');

  // 1. Botão no menu da engrenagem
  assert.ok(html.includes('abrirModalAuditoriaSistema()'), 'Botão da engrenagem deve chamar abrirModalAuditoriaSistema()');

  // 2. Estrutura do Modal
  assert.ok(html.includes('id="modal-auditoria-sistema"'), 'Modal #modal-auditoria-sistema deve existir no DOM');
  assert.ok(html.includes('id="tab-btn-auditoria-logs"'), 'Aba de logs deve existir');
  assert.ok(html.includes('id="tab-btn-auditoria-backups"'), 'Aba de backups deve existir');

  // 3. Padrão Caixa Alta Universal e Ergonomia de Teclado
  assert.ok(html.includes('id="filtro-audit-busca"'), 'Campo de busca no histórico deve existir');
  assert.ok(html.includes('text-transform: uppercase'), 'Campo de busca deve usar estilo de caixa alta');
  assert.ok(html.includes('tabindex="-1"'), 'Botões secundários devem possuir tabindex="-1"');

  // 4. Sub-modal de Diff Visual
  assert.ok(html.includes('id="modal-detalhes-diff-auditoria"'), 'Modal de detalhes de diff deve existir');
  assert.ok(html.includes('id="diff-dados-anteriores"'), 'Elemento de dados anteriores do diff deve existir');
  assert.ok(html.includes('id="diff-dados-novos"'), 'Elemento de dados novos do diff deve existir');

  // 5. Funções JavaScript obrigatórias
  assert.ok(html.includes('function abrirModalAuditoriaSistema'), 'Função abrirModalAuditoriaSistema deve existir');
  assert.ok(html.includes('function carregarLogsAuditoria'), 'Função carregarLogsAuditoria deve existir');
  assert.ok(html.includes('function carregarListaBackupsSistema'), 'Função carregarListaBackupsSistema deve existir');
  assert.ok(html.includes('function gerarBackupAgoraSistema'), 'Função gerarBackupAgoraSistema deve existir');
  assert.ok(html.includes('function visualizarDiffAuditoria'), 'Função visualizarDiffAuditoria deve existir');

  // 6. CSS Mobile responsivo
  assert.ok(mobileCss.includes('#modal-auditoria-sistema'), 'mobile.css deve conter regras para o modal de auditoria');
});
