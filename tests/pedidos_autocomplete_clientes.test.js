import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, '../public/index.html');

test('AUTOCOMPLETE CLIENTES PEDIDO 01: Inicialização e Login disparam carregarDadosApi em background', () => {
  const content = fs.readFileSync(indexPath, 'utf8');

  // Garante que a inicialização pós-login carrega a base de clientes
  assert.ok(
    content.includes('if (typeof carregarDadosApi === \'function\') carregarDadosApi();'),
    'Deve chamar carregarDadosApi() na inicialização da página e/ou após login'
  );

  // Garante que ocultarTelaLogin() chama carregarDadosApi()
  const idxLogin = content.indexOf('function ocultarTelaLogin()');
  assert.ok(idxLogin > -1, 'Função ocultarTelaLogin deve existir');
  const trechoLogin = content.slice(idxLogin, idxLogin + 400);
  assert.ok(
    trechoLogin.includes('carregarDadosApi()'),
    'ocultarTelaLogin() deve pré-aquecer a base de clientes com carregarDadosApi()'
  );
});

test('AUTOCOMPLETE CLIENTES PEDIDO 02: abrirModalNovoPedido e abrirModalEditarPedido garantem carregamento', () => {
  const content = fs.readFileSync(indexPath, 'utf8');

  // abrirModalNovoPedido deve chamar carregarDadosApi se não carregado
  const idxNovo = content.indexOf('function abrirModalNovoPedido(');
  assert.ok(idxNovo > -1, 'abrirModalNovoPedido deve existir');
  const trechoNovo = content.slice(idxNovo, idxNovo + 800);
  assert.ok(
    trechoNovo.includes('carregarDadosApi()'),
    'abrirModalNovoPedido deve disparar carregarDadosApi() se clientesCarregadosApi for falso'
  );

  // abrirModalEditarPedido deve chamar carregarDadosApi se não carregado
  const idxEdit = content.indexOf('function abrirModalEditarPedido(');
  assert.ok(idxEdit > -1, 'abrirModalEditarPedido deve existir');
  const trechoEdit = content.slice(idxEdit, idxEdit + 800);
  assert.ok(
    trechoEdit.includes('carregarDadosApi()'),
    'abrirModalEditarPedido deve disparar carregarDadosApi() se clientesCarregadosApi for falso'
  );
});

test('AUTOCOMPLETE CLIENTES PEDIDO 03: filtrarSugestoesClientesPedido reativo com auto-recuperação', () => {
  const content = fs.readFileSync(indexPath, 'utf8');

  const idxFiltro = content.indexOf('function filtrarSugestoesClientesPedido(termo)');
  assert.ok(idxFiltro > -1, 'filtrarSugestoesClientesPedido deve existir');
  const trechoFiltro = content.slice(idxFiltro, idxFiltro + 1400);

  // Deve detectar se a base ainda não carregou e exibir feedback ao operador
  assert.ok(
    trechoFiltro.includes('Carregando clientes da base oficial'),
    'Deve exibir aviso de carregamento para o operador caso a base ainda não esteja na memória'
  );

  // Deve acionar carregarDadosApi e re-filtrar
  assert.ok(
    trechoFiltro.includes('carregarDadosApi().then'),
    'Deve auto-carregar e disparar re-filtro assim que a Promise da API resolver'
  );
});

test('AUTOCOMPLETE CLIENTES PEDIDO 04: carregarDadosApi sincroniza popularDatalistClientes', () => {
  const content = fs.readFileSync(indexPath, 'utf8');

  const idxCarregar = content.indexOf('async function carregarDadosApi()');
  assert.ok(idxCarregar > -1, 'carregarDadosApi deve existir');
  const trechoCarregar = content.slice(idxCarregar, idxCarregar + 1000);

  assert.ok(
    trechoCarregar.includes('popularDatalistClientes()'),
    'carregarDadosApi deve atualizar popularDatalistClientes() após obter os dados da API'
  );
});

test('AUTOCOMPLETE CLIENTES PEDIDO 05: window.garantirBaseClientes provedor memoizado exposto', () => {
  const content = fs.readFileSync(indexPath, 'utf8');
  assert.ok(
    content.includes('window.garantirBaseClientes = function()'),
    'Deve expor window.garantirBaseClientes como provedor universal memoizado'
  );
});
