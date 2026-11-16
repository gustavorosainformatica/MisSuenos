import test from 'node:test';
import assert from 'node:assert';
import * as db from '../lib/db.js';
import handlerNfe from '../api/nfe.js';
import { FiscalHub, gerarDanfeHtml } from '../lib/fiscal_hub.js';
import { validarItensFiscais } from '../lib/wlg.js';

function criarMockRes() {
  let statusCode = 200;
  let headers = {};
  let data = null;
  let ended = false;

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    setHeader(k, v) {
      headers[k.toLowerCase()] = v;
      return res;
    },
    writeHead(code, hdrs) {
      statusCode = code;
      if (hdrs) Object.assign(headers, hdrs);
      return res;
    },
    json(obj) {
      data = obj;
      ended = true;
      return res;
    },
    end(payload) {
      data = payload;
      ended = true;
      return res;
    },
    getStatusCode: () => statusCode,
    getData: () => data,
    getHeader: (k) => headers[k.toLowerCase()]
  };
  return res;
}

test('NFE MULTI-ITENS 01: validarItensFiscais valida NCMs e calcula subtotais de múltiplos itens', () => {
  const itens = [
    {
      codigo: 'LONCA-CABRITO',
      descricao: 'Lonca de Cabrito Legítima',
      ncm: '4106.31.10',
      quantidade: 2,
      preco_unitario: 60.00
    },
    {
      codigo: 'PELE-CAPRINA',
      descricao: 'Pele Caprina Curtida',
      ncm: '41062100',
      quantidade: 1,
      preco_unitario: 115.00
    }
  ];

  const res = validarItensFiscais(itens, 'RS', 'SP');
  assert.strictEqual(res.valido, true, 'Deve ser válido');
  assert.strictEqual(res.cfopAplicado, '6102', 'Interestadual deve ser 6102');
  assert.strictEqual(res.itens.length, 2);
  assert.strictEqual(res.itens[0].ncm, '41063110');
  assert.strictEqual(res.itens[0].valor_total, 120.00);
  assert.strictEqual(res.itens[1].ncm, '41062100');
  assert.strictEqual(res.itens[1].valor_total, 115.00);
});

test('NFE MULTI-ITENS 02: validarItensFiscais rejeita itens com NCM incompleto', () => {
  const itensComErro = [
    {
      codigo: 'PROD-INVALIDO',
      descricao: 'Produto sem NCM',
      ncm: '1234', // apenas 4 dígitos
      quantidade: 1,
      preco_unitario: 50.00
    }
  ];

  const res = validarItensFiscais(itensComErro, 'RS', 'RS');
  assert.strictEqual(res.valido, false);
  assert.ok(res.erros[0].includes('sem NCM válido de 8 dígitos'));
});

test('NFE MULTI-ITENS 03: POST /api/nfe emite NF-e com múltiplos produtos e persiste itens_json', async () => {
  const req = {
    method: 'POST',
    url: '/api/nfe',
    body: {
      tipoNota: 'NFE_PRODUTO',
      cliente: {
        nome: 'CLIENTE EXEMPLO RS',
        cpf: '00000000191',
        uf: 'RS',
        cidade: 'Sapiranga',
        logradouro: 'AV. CENTRAL',
        numero: '100'
      },
      produtos: [
        {
          codigo: 'SKU-001',
          descricao: 'LONCA DE CABRITO LEGITIMA',
          ncm: '4106.31.10',
          unidade: 'UN',
          quantidade: 3,
          valor_unitario: 45.00,
          valor_total: 135.00
        },
        {
          codigo: 'SKU-002',
          descricao: 'CINTA DE COURO TRABALHADA',
          ncm: '42010090',
          unidade: 'UN',
          quantidade: 2,
          valor_unitario: 80.00,
          valor_total: 160.00
        }
      ],
      valores: {
        valorTotal: 295.00
      }
    }
  };

  const res = criarMockRes();
  await handlerNfe(req, res);

  assert.strictEqual(res.getStatusCode(), 201);
  const data = res.getData();
  assert.strictEqual(data.success, true);
  assert.ok(data.chaveAcesso);
  assert.strictEqual(data.chaveAcesso.length, 44);

  // Verifica persistência atômica no banco de dados
  const doc = await db.get('SELECT * FROM fiscal_documentos WHERE chave_acesso = ?', [data.chaveAcesso]);
  assert.ok(doc, 'Documento fiscal deve estar salvo no banco');
  assert.strictEqual(doc.tipo, 'NFE_55');
  assert.ok(doc.itens_json, 'Coluna itens_json deve estar preenchida');

  const itensSalvos = JSON.parse(doc.itens_json);
  assert.strictEqual(itensSalvos.length, 2);
  assert.strictEqual(itensSalvos[0].codigo, 'SKU-001');
  assert.strictEqual(itensSalvos[0].ncm, '41063110');
  assert.strictEqual(itensSalvos[1].codigo, 'SKU-002');
  assert.strictEqual(itensSalvos[1].ncm, '42010090');
});

test('NFE MULTI-ITENS 04: GET /api/nfe/danfe/:chave renderiza múltiplos itens reais no HTML', async () => {
  const chaveTesteDanfe = '43261100000000000191550010000007771123456789';
  const itensTeste = [
    {
      codigo: 'SKU-DANFE-01',
      descricao: 'PELE CAPRINA ESPECIAL',
      ncm: '41062100',
      cfop: '5102',
      unidade: 'UN',
      quantidade: 2,
      valor_unitario: 110.00,
      valor_total: 220.00
    },
    {
      codigo: 'SKU-DANFE-02',
      descricao: 'VAQUETA FLOATER LEGITIMA',
      ncm: '41071210',
      cfop: '5102',
      unidade: 'M2',
      quantidade: 5,
      valor_unitario: 50.00,
      valor_total: 250.00
    }
  ];

  await db.run('DELETE FROM fiscal_documentos WHERE chave_acesso = ?', [chaveTesteDanfe]);
  await db.run(`
    INSERT INTO fiscal_documentos (
      tipo, serie, numero, chave_acesso, status, motivo_status,
      protocolo_autorizacao, xml_assinado, itens_json, destinatario_json,
      valor_total, emitido_em
    ) VALUES (
      'NFE_55', '1', '777', ?, 'AUTORIZADO', 'Autorizado uso da NF-e',
      '143260000000777', '<NFe><infNFe>XML MULTI</infNFe></NFe>',
      ?, ?, 470.00, '2026-11-16T12:00:00Z'
    )
  `, [
    chaveTesteDanfe,
    JSON.stringify(itensTeste),
    JSON.stringify({ nome: 'CLIENTE MULTI TESTE', documento: '00000000191', uf: 'RS', cidade: 'Sapiranga' })
  ]);

  const reqDanfe = {
    method: 'GET',
    url: `/api/nfe/danfe/${chaveTesteDanfe}`
  };
  const resDanfe = criarMockRes();
  await handlerNfe(reqDanfe, resDanfe);

  assert.strictEqual(resDanfe.getStatusCode(), 200);
  const html = resDanfe.getData();
  assert.ok(typeof html === 'string');
  assert.ok(html.includes('DANFE'), 'Deve conter cabeçalho DANFE');
  assert.ok(html.includes('PELE CAPRINA ESPECIAL'), 'Deve conter descrição do Item 1');
  assert.ok(html.includes('41062100'), 'Deve conter NCM do Item 1');
  assert.ok(html.includes('VAQUETA FLOATER LEGITIMA'), 'Deve conter descrição do Item 2');
  assert.ok(html.includes('41071210'), 'Deve conter NCM do Item 2');
  assert.ok(html.includes('CLIENTE MULTI TESTE'), 'Deve conter destinatário');
});

test('NFE MULTI-ITENS 05: Fallback seguro para notas fiscais legadas sem itens_json', async () => {
  const chaveLegada = '43261100000000000191550010000008881123456789';
  await db.run('DELETE FROM fiscal_documentos WHERE chave_acesso = ?', [chaveLegada]);
  await db.run(`
    INSERT INTO fiscal_documentos (
      tipo, serie, numero, chave_acesso, status, motivo_status,
      protocolo_autorizacao, xml_assinado, itens_json, emitido_em
    ) VALUES (
      'NFE_55', '1', '888', ?, 'AUTORIZADO', 'Autorizado',
      '143260000000888', '<NFe><infNFe>XML LEGADO</infNFe></NFe>',
      NULL, '2026-11-16T12:00:00Z'
    )
  `, [chaveLegada]);

  const reqDanfe = {
    method: 'GET',
    url: `/api/nfe/danfe/${chaveLegada}`
  };
  const resDanfe = criarMockRes();
  await handlerNfe(reqDanfe, resDanfe);

  assert.strictEqual(resDanfe.getStatusCode(), 200);
  const html = resDanfe.getData();
  assert.ok(html.includes('DANFE'));
  assert.ok(html.includes('ARTIGOS DE COURO E SELARIA MIS SUEÑOS'));
});

test('NFE MULTI-ITENS 06: UI index.html possui tabela rica de itens fiscais e controles dinâmicos', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync('public/index.html', 'utf8');

  // Estrutura da tabela
  assert.ok(html.includes('id="tabela-itens-fiscal"'), 'Tabela de itens fiscais deve existir no index.html');
  assert.ok(html.includes('id="fiscal-itens-tbody"'), 'Tbody dinâmico de itens fiscais deve existir');
  assert.ok(html.includes('onclick="adicionarLinhaItemFiscal()"'), 'Botão de adicionar item fiscal deve existir');
  assert.ok(html.includes('id="fiscal-qtd-itens-badge"'), 'Badge contador de itens fiscais deve existir');
  assert.ok(html.includes('id="fiscal-subtotal-produtos"'), 'Subtotal de produtos deve existir');
  assert.ok(html.includes('id="fiscal-subtotal-frete"'), 'Subtotal de frete deve existir');
  assert.ok(html.includes('id="fiscal-valor-total-exibicao"'), 'Total da NF-e formatado deve existir');

  // Funções JavaScript do controller fiscal
  assert.ok(html.includes('function adicionarLinhaItemFiscal('), 'Função adicionarLinhaItemFiscal deve estar definida');
  assert.ok(html.includes('function removerLinhaItemFiscal('), 'Função removerLinhaItemFiscal deve estar definida');
  assert.ok(html.includes('function recalcularTotaisModalFiscal('), 'Função recalcularTotaisModalFiscal deve estar definida');
  assert.ok(html.includes('function auditarNcmsItensFiscais('), 'Função auditarNcmsItensFiscais deve estar definida');
  assert.ok(html.includes('function formatarMascaraNcm('), 'Função formatarMascaraNcm deve estar definida');

  // Ergonomia de teclado e botões secundários
  assert.ok(html.includes('tabindex="-1" class="btn-top" onclick="removerLinhaItemFiscal(this)"'), 'Botão excluir item deve ter tabindex="-1"');
});

