import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../lib/db.js';

test('TICKET 01 - DB: Tabela fornecedores_produtos_vinculo existe e impõe UNIQUE(fornecedor_id, codigo_fornecedor)', async () => {
  const fornecedorId = 99999;
  const codigoFornecedor = 'TEST_SKU_VINCO_001';

  // Limpa resquícios se houver
  await db.run('DELETE FROM fornecedores_produtos_vinculo WHERE fornecedor_id = ? AND codigo_fornecedor = ?', [fornecedorId, codigoFornecedor]);

  // Inserção bem-sucedida
  const res = await db.run(`
    INSERT INTO fornecedores_produtos_vinculo (
      fornecedor_id, codigo_fornecedor, ean_fornecedor, descricao_fornecedor, produto_erp_id, fator_conversao, unidade_fornecedor
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [fornecedorId, codigoFornecedor, '7891234567890', 'PRODUTO TESTE VINCULO', 1, 2.5, 'CX']);

  assert.ok(res.lastInsertRowid || res.rowsAffected > 0, 'Inserção deve ter sucesso');

  // Consulta e validação de campos
  const registro = await db.get(`
    SELECT * FROM fornecedores_produtos_vinculo WHERE fornecedor_id = ? AND codigo_fornecedor = ?
  `, [fornecedorId, codigoFornecedor]);

  assert.ok(registro, 'Registro inserido deve ser recuperado');
  assert.strictEqual(registro.fornecedor_id, fornecedorId);
  assert.strictEqual(registro.codigo_fornecedor, codigoFornecedor);
  assert.strictEqual(Number(registro.fator_conversao), 2.5);
  assert.strictEqual(registro.unidade_fornecedor, 'CX');

  // Inserção duplicada deve estourar erro de restrição UNIQUE
  await assert.rejects(async () => {
    await db.run(`
      INSERT INTO fornecedores_produtos_vinculo (
        fornecedor_id, codigo_fornecedor, descricao_fornecedor, produto_erp_id
      ) VALUES (?, ?, ?, ?)
    `, [fornecedorId, codigoFornecedor, 'PRODUTO DUPLICADO', 1]);
  }, /UNIQUE/i, 'Deve rejeitar duplicidade de (fornecedor_id, codigo_fornecedor)');

  // Limpeza
  await db.run('DELETE FROM fornecedores_produtos_vinculo WHERE fornecedor_id = ? AND codigo_fornecedor = ?', [fornecedorId, codigoFornecedor]);
});

test('TICKET 01 - DB: Tabela transportadoras_config contém as 4 transportadoras homologadas', async () => {
  const transportadoras = await db.query('SELECT id, nome, ativo, padrao, ambiente FROM transportadoras_config');
  assert.ok(Array.isArray(transportadoras), 'Deve retornar lista de transportadoras');

  const ids = transportadoras.map(t => t.id);
  assert.ok(ids.includes('melhor_envio'), 'Deve conter melhor_envio');
  assert.ok(ids.includes('superfrete'), 'Deve conter superfrete');
  assert.ok(ids.includes('correios_cws'), 'Deve conter correios_cws');
  assert.ok(ids.includes('frenet'), 'Deve conter frenet');

  const melhorEnvio = transportadoras.find(t => t.id === 'melhor_envio');
  assert.strictEqual(Number(melhorEnvio.ativo), 1, 'Melhor Envio deve vir ativo por padrão');
  assert.strictEqual(Number(melhorEnvio.padrao), 1, 'Melhor Envio deve ser o provedor padrão inicial');
});

test('TICKET 01 - DB: Tabela conciliacao_extratos existe e impõe UNIQUE no fitid', async () => {
  const fitidTeste = 'FITID_TDD_TEST_99999';

  // Limpeza
  await db.run('DELETE FROM conciliacao_extratos WHERE fitid = ?', [fitidTeste]);

  // Inserção inicial
  await db.run(`
    INSERT INTO conciliacao_extratos (
      origem, fitid, data_transacao, descricao, tipo, valor, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, ['OFX', fitidTeste, '2026-11-10', 'TRANSF PIX RECEBIDA', 'CREDITO', 250.00, 'PENDENTE']);

  const row = await db.get('SELECT * FROM conciliacao_extratos WHERE fitid = ?', [fitidTeste]);
  assert.ok(row, 'Extrato inserido deve ser encontrado');
  assert.strictEqual(row.fitid, fitidTeste);
  assert.strictEqual(Number(row.valor), 250.00);

  // Inserção com mesmo fitid deve falhar
  await assert.rejects(async () => {
    await db.run(`
      INSERT INTO conciliacao_extratos (
        origem, fitid, data_transacao, descricao, tipo, valor
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, ['OFX', fitidTeste, '2026-11-10', 'TRANSF PIX DUPLICADA', 'CREDITO', 250.00]);
  }, /UNIQUE/i, 'Deve rejeitar fitid duplicado');

  // Limpeza
  await db.run('DELETE FROM conciliacao_extratos WHERE fitid = ?', [fitidTeste]);
});

test('TICKET 01 - DB: Tabela fiscal_config contém configuração padrão inicial', async () => {
  const config = await db.get('SELECT * FROM fiscal_config WHERE id = 1');
  assert.ok(config, 'Configuração fiscal inicial id=1 deve existir');
  assert.ok(['homologacao', 'producao'].includes(config.ambiente), 'Ambiente fiscal deve ser homologação ou produção');
  assert.ok(['wlg', 'focus', 'nativo'].includes(config.driver_ativo), 'Driver ativo deve ser homologado');
  assert.strictEqual(Number(config.serie_nfe), 1, 'Série NF-e padrão deve ser 1');
});

test('TICKET 01 - DB: Tabela fiscal_documentos aceita inserção e rejeita duplicidade de chave_acesso', async () => {
  const chaveTeste = '35261100000000000000550010000000011000000099';

  // Limpeza
  await db.run('DELETE FROM fiscal_documentos WHERE chave_acesso = ?', [chaveTeste]);

  // Inserção de documento fiscal
  await db.run(`
    INSERT INTO fiscal_documentos (
      tipo, numero, serie, chave_acesso, status, motivo_status
    ) VALUES (?, ?, ?, ?, ?, ?)
  `, ['NFE_55', 1, 1, chaveTeste, 'AUTORIZADA', 'Autorizado o uso da NF-e']);

  const doc = await db.get('SELECT * FROM fiscal_documentos WHERE chave_acesso = ?', [chaveTeste]);
  assert.ok(doc, 'Documento fiscal inserido deve ser encontrado');
  assert.strictEqual(doc.chave_acesso, chaveTeste);
  assert.strictEqual(doc.status, 'AUTORIZADA');

  // Inserção com mesma chave deve falhar
  await assert.rejects(async () => {
    await db.run(`
      INSERT INTO fiscal_documentos (
        tipo, numero, serie, chave_acesso, status
      ) VALUES (?, ?, ?, ?, ?)
    `, ['NFE_55', 2, 1, chaveTeste, 'REJEITADA']);
  }, /UNIQUE/i, 'Deve rejeitar chave_acesso fiscal duplicada');

  // Limpeza
  await db.run('DELETE FROM fiscal_documentos WHERE chave_acesso = ?', [chaveTeste]);
});


import {
  parseXmlNfeCompleto,
  resolverDeParaItem,
  salvarOuAtualizarVinculoDePara,
  processarItensXmlComDePara
} from '../lib/compras_parser.js';

test('TICKET 02 - PARSER: Extração completa de XML NF-e Modelo 55 (Emitente, Destinatário, Itens, Totais, Cobrança)', () => {
  const xmlTeste = `
    <?xml version="1.0" encoding="UTF-8"?>
    <nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
      <NFe>
        <infNFe Id="NFe35261112345678000199550010000001231000001234" versao="4.00">
          <ide>
            <nNF>123</nNF>
            <serie>1</serie>
            <natOp>COMPRA PARA INDUSTRIALIZACAO</natOp>
            <dhEmi>2026-11-10T10:00:00-03:00</dhEmi>
            <tpNF>0</tpNF>
          </ide>
          <emit>
            <CNPJ>12345678000199</CNPJ>
            <xNome>Fornecedor Couros Brasil Ltda &amp; Cia</xNome>
            <xFant>Couros Brasil</xFant>
            <IE>123456789</IE>
            <enderEmit>
              <xLgr>Rua das Indústrias</xLgr>
              <nro>500</nro>
              <xBairro>Distrito Industrial</xBairro>
              <xMun>Novo Hamburgo</xMun>
              <UF>RS</UF>
              <CEP>93300000</CEP>
              <fone>5133334444</fone>
            </enderEmit>
          </emit>
          <dest>
            <CNPJ>98765432000188</CNPJ>
            <xNome>Mis Sueños Móveis &amp; Estofados</xNome>
            <IE>987654321</IE>
            <enderDest>
              <xMun>Gramado</xMun>
              <UF>RS</UF>
            </enderDest>
          </dest>
          <det nItem="1">
            <prod>
              <cProd>COU-CAP-01</cProd>
              <cEAN>7891000200010</cEAN>
              <xProd>Pele Caprina Natural Curtida</xProd>
              <NCM>41062100</NCM>
              <CFOP>5102</CFOP>
              <uCom>UN</uCom>
              <qCom>10.0000</qCom>
              <vUnCom>80.0000</vUnCom>
              <vProd>800.00</vProd>
            </prod>
            <imposto>
              <vICMS>96.00</vICMS>
            </imposto>
          </det>
          <det nItem="2">
            <prod>
              <cProd>LIN-NYL-02</cProd>
              <cEAN>SEM GTIN</cEAN>
              <xProd>Linha de Nylon 40 Bonderizada</xProd>
              <NCM>54011011</NCM>
              <CFOP>5102</CFOP>
              <uCom>CAR</uCom>
              <qCom>4.0000</qCom>
              <vUnCom>25.0000</vUnCom>
              <vProd>100.00</vProd>
            </prod>
          </det>
          <total>
            <ICMSTot>
              <vProd>900.00</vProd>
              <vFrete>50.00</vFrete>
              <vSeg>0.00</vSeg>
              <vDesc>0.00</vDesc>
              <vNF>950.00</vNF>
              <vICMS>96.00</vICMS>
            </ICMSTot>
          </total>
          <cobr>
            <dup>
              <nDup>001</nDup>
              <dVenc>2026-11-25</dVenc>
              <vDup>475.00</vDup>
            </dup>
            <dup>
              <nDup>002</nDup>
              <dVenc>2026-12-25</dVenc>
              <vDup>475.00</vDup>
            </dup>
          </cobr>
          <infAdic>
            <infCpl>Pedido Fornecedor #4892. Entrega via transportadora parceira.</infCpl>
          </infAdic>
        </infNFe>
      </NFe>
    </nfeProc>
  `;

  const parsed = parseXmlNfeCompleto(xmlTeste);

  assert.strictEqual(parsed.chave_nfe, '35261112345678000199550010000001231000001234');
  assert.strictEqual(parsed.numero_nfe, '123');
  assert.strictEqual(parsed.serie_nfe, '1');
  assert.strictEqual(parsed.fornecedor.cnpj, '12345678000199');
  assert.strictEqual(parsed.fornecedor.razao_social, 'FORNECEDOR COUROS BRASIL LTDA & CIA');
  assert.strictEqual(parsed.fornecedor.cidade, 'NOVO HAMBURGO');
  assert.strictEqual(parsed.fornecedor.uf, 'RS');
  assert.strictEqual(parsed.destinatario.documento, '98765432000188');

  // Validação dos Itens
  assert.strictEqual(parsed.itens.length, 2);
  const item1 = parsed.itens[0];
  assert.strictEqual(item1.codigo, 'COU-CAP-01');
  assert.strictEqual(item1.ean, '7891000200010');
  assert.strictEqual(item1.descricao, 'PELE CAPRINA NATURAL CURTIDA');
  assert.strictEqual(item1.quantidade, 10);
  assert.strictEqual(item1.valor_unitario, 80);
  assert.strictEqual(item1.valor_total, 800);

  const item2 = parsed.itens[1];
  assert.strictEqual(item2.codigo, 'LIN-NYL-02');
  assert.strictEqual(item2.ean, '', 'SEM GTIN deve ser normalizado para string vazia');
  assert.strictEqual(item2.quantidade, 4);
  assert.strictEqual(item2.valor_total, 100);

  // Totais e Cobrança
  assert.strictEqual(parsed.totais.valor_produtos, 900);
  assert.strictEqual(parsed.totais.valor_frete, 50);
  assert.strictEqual(parsed.totais.valor_total_nota, 950);
  assert.strictEqual(parsed.duplicatas.length, 2);
  assert.strictEqual(parsed.duplicatas[0].valor, 475);
  assert.strictEqual(parsed.duplicatas[1].valor, 475);
  assert.strictEqual(parsed.duplicatas[0].vencimento, '2026-11-25');
  assert.ok(parsed.informacoes_complementares.includes('Pedido Fornecedor #4892'));
});

test('TICKET 02 - DE-PARA: Resolver vínculo memorizado existente na tabela fornecedores_produtos_vinculo', async () => {
  const fornecedorId = 7777;
  const codigoFornecedor = 'SKU_TEST_MEMORIZADO_01';
  let testProdId;

  // Limpa resquícios prévios
  await db.run('DELETE FROM fornecedores_produtos_vinculo WHERE fornecedor_id = ? AND codigo_fornecedor = ?', [fornecedorId, codigoFornecedor]);

  // Cria produto no ERP para teste
  const agora = new Date().toISOString();
  const resProd = await db.run(`
    INSERT INTO produtos (nome, categoria, unidade_medida, preco_custo, preco_venda, estoque_atual, ativo, data_cadastro)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['PRODUTO DE-PARA TESTE', 'MATERIAIS', 'UN', 50.0, 100.0, 10, 1, agora]);
  testProdId = resProd.lastInsertRowid;

  // Cria o vínculo prévio com fator de conversão 12 (caixa com 12)
  await db.run(`
    INSERT INTO fornecedores_produtos_vinculo (
      fornecedor_id, codigo_fornecedor, descricao_fornecedor, produto_erp_id, fator_conversao, unidade_fornecedor
    ) VALUES (?, ?, ?, ?, ?, ?)
  `, [fornecedorId, codigoFornecedor, 'DESCRIÇÃO FORNECEDOR', testProdId, 12.0, 'CX']);

  // Executa resolução
  const resolucao = await resolverDeParaItem(fornecedorId, {
    codigo: codigoFornecedor,
    descricao: 'QUALQUER DESCRICAO',
    unidade: 'CX'
  });

  assert.strictEqual(resolucao.vinculado, true);
  assert.strictEqual(resolucao.confianca, 'MEMORIZADO');
  assert.strictEqual(resolucao.produtoErpId, testProdId);
  assert.strictEqual(resolucao.fatorConversao, 12.0);
  assert.strictEqual(resolucao.unidadeErp, 'UN');

  // Limpeza
  await db.run('DELETE FROM fornecedores_produtos_vinculo WHERE fornecedor_id = ? AND codigo_fornecedor = ?', [fornecedorId, codigoFornecedor]);
  await db.run('DELETE FROM produtos WHERE id = ?', [testProdId]);
});

test('TICKET 02 - DE-PARA: Resolver correspondência automática por Código de Barras (EAN/GTIN)', async () => {
  const eanTeste = '7899998881234';
  let testProdId;

  // Cria produto com código de barras cadastrado
  const agora = new Date().toISOString();
  const resProd = await db.run(`
    INSERT INTO produtos (nome, categoria, unidade_medida, preco_custo, preco_venda, estoque_atual, codigo_barras, ativo, data_cadastro)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['COLA DE CONTATO PREMIUM', 'QUIMICOS', 'L', 30.0, 60.0, 5, eanTeste, 1, agora]);
  testProdId = resProd.lastInsertRowid;

  // Fornecedor novo, sem vínculo memorizado mas com EAN no XML
  const resolucao = await resolverDeParaItem(99911, {
    codigo: 'SKU_INEDITO_123',
    ean: eanTeste,
    descricao: 'COLA ESPECIAL',
    unidade: 'L'
  });

  assert.strictEqual(resolucao.vinculado, true);
  assert.strictEqual(resolucao.confianca, 'EAN');
  assert.strictEqual(resolucao.produtoErpId, testProdId);
  assert.strictEqual(resolucao.fatorConversao, 1.0);

  // Limpeza
  await db.run('DELETE FROM produtos WHERE id = ?', [testProdId]);
});

test('TICKET 02 - DE-PARA: Salvar e atualizar vínculo com Upsert (ON CONFLICT)', async () => {
  const fornecedorId = 8888;
  const codigoFornecedor = 'SKU_UPSERT_001';

  // 1ª Inserção: Fator 6.0
  const v1 = await salvarOuAtualizarVinculoDePara({
    fornecedorId,
    codigoFornecedor,
    descricaoFornecedor: 'PACOTE COM 6',
    produtoErpId: 1,
    fatorConversao: 6.0,
    unidadeFornecedor: 'PCT'
  });
  assert.strictEqual(Number(v1.fator_conversao), 6.0);
  assert.strictEqual(v1.unidade_fornecedor, 'PCT');

  // 2ª Inserção (Atualização / Upsert): Fator 24.0
  const v2 = await salvarOuAtualizarVinculoDePara({
    fornecedorId,
    codigoFornecedor,
    descricaoFornecedor: 'CAIXA MASTER COM 24',
    produtoErpId: 1,
    fatorConversao: 24.0,
    unidadeFornecedor: 'CX'
  });
  assert.strictEqual(Number(v2.fator_conversao), 24.0);
  assert.strictEqual(v2.unidade_fornecedor, 'CX');

  // Limpeza
  await db.run('DELETE FROM fornecedores_produtos_vinculo WHERE fornecedor_id = ? AND codigo_fornecedor = ?', [fornecedorId, codigoFornecedor]);
});

test('TICKET 02 - ENRIQUECIMENTO: Processar lista de itens de XML calculando estoque convertido e pendências', async () => {
  const fornecedorId = 6666;
  const codigoVinculado = 'SKU_VINC_OK';

  // Limpa resquícios se houver
  await db.run('DELETE FROM fornecedores_produtos_vinculo WHERE fornecedor_id = ? AND codigo_fornecedor = ?', [fornecedorId, codigoVinculado]);

  // Cria produto real no banco para o teste
  const agora = new Date().toISOString();
  const resProd = await db.run(`
    INSERT INTO produtos (nome, categoria, unidade_medida, preco_custo, preco_venda, estoque_atual, ativo, data_cadastro)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['PRODUTO VINCULADO TESTE', 'MATERIAIS', 'UN', 20.0, 40.0, 10, 1, agora]);
  const prodId = resProd.lastInsertRowid;

  // Cria vínculo para o item 1 com fator 5 (caixa com 5 peças)
  await db.run(`
    INSERT INTO fornecedores_produtos_vinculo (
      fornecedor_id, codigo_fornecedor, descricao_fornecedor, produto_erp_id, fator_conversao, unidade_fornecedor
    ) VALUES (?, ?, ?, ?, ?, ?)
  `, [fornecedorId, codigoVinculado, 'ITEM COM VINCULO', prodId, 5.0, 'CX']);

  const itensXml = [
    {
      numero_item: 1,
      codigo: codigoVinculado,
      descricao: 'ITEM VINCULADO',
      quantidade: 10, // 10 caixas
      valor_unitario: 50.0,
      valor_total: 500.0,
      unidade: 'CX'
    },
    {
      numero_item: 2,
      codigo: 'SKU_SEM_VINCULO',
      descricao: 'ITEM TOTALMENTE NOVO DESCONHECIDO',
      quantidade: 2,
      valor_unitario: 100.0,
      valor_total: 200.0,
      unidade: 'UN'
    }
  ];

  const resultado = await processarItensXmlComDePara(itensXml, fornecedorId);

  assert.strictEqual(resultado.totalItens, 2);
  assert.strictEqual(resultado.itensVinculados, 1);
  assert.strictEqual(resultado.itensPendentes, 1);
  assert.strictEqual(resultado.prontoParaEntrada, false, 'Não deve estar pronto se houver pendências');

  // Item 1 convertido: 10 caixas * 5 = 50 unidades no estoque
  const item1 = resultado.itens[0];
  assert.strictEqual(item1.dePara.vinculado, true);
  assert.strictEqual(item1.quantidade_estoque, 50);
  assert.strictEqual(item1.custo_unitario_convertido, 10.0); // 50.0 / 5 = 10.0

  // Item 2 pendente
  const item2 = resultado.itens[1];
  assert.strictEqual(item2.dePara.vinculado, false);
  assert.strictEqual(item2.dePara.confianca, 'PENDENTE');

  // Limpeza
  await db.run('DELETE FROM fornecedores_produtos_vinculo WHERE fornecedor_id = ? AND codigo_fornecedor = ?', [fornecedorId, codigoVinculado]);
  await db.run('DELETE FROM produtos WHERE id = ?', [prodId]);
});

import handlerCompras from '../api/compras.js';

function criarMockRes() {
  let statusCode = 0;
  let responseData = null;
  return {
    status(code) { statusCode = code; return this; },
    json(data) { responseData = data; return this; },
    writeHead(code) { statusCode = code; return this; },
    end(str) {
      if (typeof str === 'string') {
        try { responseData = JSON.parse(str); } catch { responseData = str; }
      } else {
        responseData = str;
      }
      return this;
    },
    getStatusCode: () => statusCode,
    getData: () => responseData
  };
}

test('TICKET 03 - API: POST /api/compras/importar-xml analisa nota, extrai dados e enriquece De-Para', async () => {
  const chaveUnica = '35261188888888000199550010000008881000000888';
  // Garante limpeza prévia
  await db.run('DELETE FROM compras_xml WHERE chave_nfe = ?', [chaveUnica]);

  const xmlTeste = `
    <nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
      <NFe>
        <infNFe Id="NFe${chaveUnica}" versao="4.00">
          <ide><nNF>888</nNF><serie>1</serie><dhEmi>2026-11-10T08:00:00-03:00</dhEmi></ide>
          <emit>
            <CNPJ>88888888000199</CNPJ>
            <xNome>Fornecedor Espumas do Sul Ltda</xNome>
          </emit>
          <dest><CNPJ>98765432000188</CNPJ><xNome>Mis Suenos</xNome></dest>
          <det nItem="1">
            <prod>
              <cProd>ESP-D33-BLOC</cProd>
              <xProd>Bloco de Espuma D33 5cm</xProd>
              <uCom>UN</uCom>
              <qCom>5.0000</qCom>
              <vUnCom>120.0000</vUnCom>
              <vProd>600.00</vProd>
            </prod>
          </det>
          <total><ICMSTot><vProd>600.00</vProd><vNF>600.00</vNF></ICMSTot></total>
          <cobr><dup><nDup>001</nDup><dVenc>2026-12-10</dVenc><vDup>600.00</vDup></dup></cobr>
        </infNFe>
      </NFe>
    </nfeProc>
  `;

  const req = {
    method: 'POST',
    url: '/api/compras/importar-xml',
    body: { xml: xmlTeste }
  };
  const res = criarMockRes();

  await handlerCompras(req, res);

  assert.strictEqual(res.getStatusCode(), 200);
  const data = res.getData();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.chave_nfe, chaveUnica);
  assert.strictEqual(data.numero_nfe, '888');
  assert.strictEqual(data.valor_total, 600);
  assert.strictEqual(data.itens.length, 1);
  assert.ok(data.resumo_de_para, 'Deve conter resumo_de_para');
  assert.strictEqual(data.resumo_de_para.total_itens, 1);
});

test('TICKET 03 - API: POST /api/compras/confirmar-entrada executa fluxo atômico (Fornecedor, Kardex, Pagar e De-Para)', async () => {
  const chaveCompra = '35261177777777000199550010000007771000000777';
  const cnpjFornecedor = '77777777000199';
  const codFornecedorItem = 'INS-TEC-LINHO-01';

  // 1. Limpeza prévia
  await db.run('DELETE FROM compras_xml WHERE chave_nfe = ?', [chaveCompra]);
  await db.run('DELETE FROM financeiro_lancamentos WHERE chave_nfe_origem = ?', [chaveCompra]);
  await db.run('DELETE FROM fornecedores WHERE cnpj = ?', [cnpjFornecedor]);

  // 2. Cria produto no catálogo para vincular
  const agora = new Date().toISOString();
  const resProd = await db.run(`
    INSERT INTO produtos (nome, categoria, unidade_medida, preco_custo, preco_venda, estoque_atual, ativo, data_cadastro)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['TECIDO LINHO CRU 1.40M', 'TECIDOS', 'M', 40.0, 80.0, 20.0, 1, agora]);
  const prodId = resProd.lastInsertRowid;

  // 3. Monta payload de confirmação com 1 item (fator 10 = rolo de 10m vira 10m no estoque) e 2 duplicatas
  const payload = {
    chave_nfe: chaveCompra,
    numero_nfe: '777',
    serie_nfe: '1',
    data_emissao: '2026-11-10',
    valor_total: 1000.0,
    fornecedor: {
      documento: cnpjFornecedor,
      cnpj: cnpjFornecedor,
      razao_social: 'TECIDOS & CIA BRASIL LTDA',
      cidade: 'PORTO ALEGRE',
      uf: 'RS'
    },
    duplicatas: [
      { numero: '001', vencimento: '2026-12-10', valor: 500.0 },
      { numero: '002', vencimento: '2027-01-10', valor: 500.0 }
    ],
    itens: [
      {
        codigo: codFornecedorItem,
        descricao: 'ROLO TECIDO LINHO 10M',
        quantidade: 2, // 2 rolos
        valor_unitario: 500.0,
        valor_total: 1000.0,
        unidade: 'ROL',
        produto_erp_id: prodId,
        fator_conversao: 10.0, // 2 rolos * 10 = 20 metros
        movimentar_estoque: true
      }
    ],
    lancar_financeiro: true,
    atualizar_estoque: true
  };

  const req = {
    method: 'POST',
    url: '/api/compras/confirmar-entrada',
    body: payload
  };
  const res = criarMockRes();

  await handlerCompras(req, res);

  assert.strictEqual(res.getStatusCode(), 201);
  const data = res.getData();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.parcelas_lancadas, 2);
  assert.strictEqual(data.itens_somados_estoque, 1);
  assert.strictEqual(data.vinculos_memorizados, 1);

  // 4. Valida se o estoque do produto somou 20 metros (saldo anterior 20 + 20 = 40)
  const prodAtualizado = await db.get('SELECT estoque_atual, preco_custo FROM produtos WHERE id = ?', [prodId]);
  assert.strictEqual(Number(prodAtualizado.estoque_atual), 40.0);

  // 5. Valida se Kardex registrou a entrada
  const movEstoque = await db.get(`
    SELECT * FROM estoque_movimentacoes 
    WHERE produto_id = ? AND documento_referencia = 'NF-e #777'
  `, [prodId]);
  assert.ok(movEstoque, 'Movimentação de Kardex deve existir');
  assert.strictEqual(movEstoque.tipo, 'ENTRADA');
  assert.strictEqual(Number(movEstoque.quantidade), 20.0);
  assert.strictEqual(Number(movEstoque.saldo_posterior), 40.0);

  // 6. Valida se lançou as 2 parcelas no Contas a Pagar
  const lancamentos = await db.query(`
    SELECT * FROM financeiro_lancamentos 
    WHERE chave_nfe_origem = ? ORDER BY data_vencimento ASC
  `, [chaveCompra]);
  assert.strictEqual(lancamentos.length, 2);
  assert.strictEqual(Number(lancamentos[0].valor), 500.0);
  assert.strictEqual(lancamentos[0].tipo, 'PAGAR');

  // 7. Valida se memorizou o vínculo De-Para
  const vinculo = await db.get(`
    SELECT * FROM fornecedores_produtos_vinculo 
    WHERE fornecedor_id = ? AND codigo_fornecedor = ?
  `, [data.fornecedor_id, codFornecedorItem]);
  assert.ok(vinculo, 'Vínculo De-Para deve ter sido memorizado');
  assert.strictEqual(Number(vinculo.fator_conversao), 10.0);
  assert.strictEqual(vinculo.produto_erp_id, prodId);

  // 8. Limpeza dos dados de teste
  await db.run('DELETE FROM compras_xml WHERE chave_nfe = ?', [chaveCompra]);
  await db.run('DELETE FROM financeiro_lancamentos WHERE chave_nfe_origem = ?', [chaveCompra]);
  await db.run('DELETE FROM estoque_movimentacoes WHERE produto_id = ?', [prodId]);
  await db.run('DELETE FROM fornecedores_produtos_vinculo WHERE fornecedor_id = ? AND codigo_fornecedor = ?', [data.fornecedor_id, codFornecedorItem]);
  await db.run('DELETE FROM fornecedores WHERE cnpj = ?', [cnpjFornecedor]);
  await db.run('DELETE FROM produtos WHERE id = ?', [prodId]);
});

test('TICKET 03 - API: Bloqueio idempotente retorna HTTP 409 para nota já importada', async () => {
  const chaveExistente = '35261166666666000199550010000006661000000666';

  // Cria registro fake na compras_xml
  await db.run('DELETE FROM compras_xml WHERE chave_nfe = ?', [chaveExistente]);
  await db.run(`
    INSERT INTO compras_xml (
      chave_nfe, numero_nfe, serie_nfe, fornecedor_cnpj, fornecedor_nome, valor_total, data_emissao, data_importacao
    ) VALUES (?, '666', '1', '66666666000199', 'FORN FAKE', 100.0, '2026-11-10', '2026-11-10T12:00:00Z')
  `, [chaveExistente]);

  // Tenta confirmar entrada com a mesma chave
  const req = {
    method: 'POST',
    url: '/api/compras/confirmar-entrada',
    body: {
      chave_nfe: chaveExistente,
      numero_nfe: '666',
      valor_total: 100.0
    }
  };
  const res = criarMockRes();

  await handlerCompras(req, res);

  assert.strictEqual(res.getStatusCode(), 409, 'Deve responder HTTP 409 Conflict');
  const data = res.getData();
  assert.ok(data.error.includes('já foi importada anteriormente'));

  // Limpeza
  await db.run('DELETE FROM compras_xml WHERE chave_nfe = ?', [chaveExistente]);
});

test('TICKET 03 - API: GET /api/compras/de-para/:fornecedorId retorna o mapa de vínculos do fornecedor', async () => {
  const fornId = 5555;
  const skuTeste = 'SKU_MAPA_TEST_01';

  // Cria produto e vínculo para testar
  const agora = new Date().toISOString();
  const resProd = await db.run(`
    INSERT INTO produtos (nome, categoria, unidade_medida, preco_custo, preco_venda, estoque_atual, ativo, data_cadastro)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['PRODUTO MAPA TESTE', 'MATERIAIS', 'UN', 15.0, 30.0, 5, 1, agora]);
  const prodId = resProd.lastInsertRowid;

  await db.run(`
    INSERT INTO fornecedores_produtos_vinculo (
      fornecedor_id, codigo_fornecedor, descricao_fornecedor, produto_erp_id, fator_conversao, unidade_fornecedor
    ) VALUES (?, ?, ?, ?, ?, ?)
  `, [fornId, skuTeste, 'DESCRICAO ITEM FORNECEDOR', prodId, 4.0, 'PCT']);

  const req = {
    method: 'GET',
    url: `/api/compras/de-para/${fornId}`
  };
  const res = criarMockRes();

  await handlerCompras(req, res);

  assert.strictEqual(res.getStatusCode(), 200);
  const data = res.getData();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.fornecedor_id, fornId);
  assert.ok(Array.isArray(data.vinculos));
  assert.ok(data.vinculos.length >= 1);

  const item = data.vinculos.find(v => v.codigo_fornecedor === skuTeste);
  assert.ok(item, 'Item vinculado deve constar no array');
  assert.strictEqual(Number(item.fator_conversao), 4.0);
  assert.strictEqual(item.unidade_fornecedor, 'PCT');
  assert.strictEqual(item.produto_erp_nome, 'PRODUTO MAPA TESTE');

  // Limpeza
  await db.run('DELETE FROM fornecedores_produtos_vinculo WHERE fornecedor_id = ? AND codigo_fornecedor = ?', [fornId, skuTeste]);
  await db.run('DELETE FROM produtos WHERE id = ?', [prodId]);
});

import fs from 'node:fs';
import path from 'node:path';

test('TICKET 04 - UI: Modal #modal-importar-xml possui estrutura completa de 3 cards, dropzone e dropdown flutuante', () => {
  const htmlPath = path.resolve('public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Modal principal e container responsivo
  assert.ok(html.includes('id="modal-importar-xml"'), 'Deve conter modal-importar-xml');
  assert.ok(html.includes('max-width: 1240px'), 'Container deve ter largura ergonômica para tabela de compras');
  assert.ok(html.includes('id="dropdown-flutuante-de-para"'), 'Deve possuir container flutuante anti-overflow');

  // Dropzone com eventos nativos de Drag and Drop
  assert.ok(html.includes('ondragover="aoArrastarSobreXmlDropzone(event)"'), 'Dropzone deve ter ondragover');
  assert.ok(html.includes('ondragleave="aoSairXmlDropzone(event)"'), 'Dropzone deve ter ondragleave');
  assert.ok(html.includes('ondrop="aoSoltarArquivoXml(event)"'), 'Dropzone deve ter ondrop');

  // 3 Cards analíticos
  assert.ok(html.includes('id="xml-prev-fornecedor-nome"'), 'Card 1 Fornecedor deve ter elemento do nome');
  assert.ok(html.includes('id="xml-prev-fornecedor-status"'), 'Card 1 Fornecedor deve ter badge de status no ERP');
  assert.ok(html.includes('id="xml-prev-nota-num"'), 'Card 2 NF-e deve ter elemento de número/série');
  assert.ok(html.includes('id="xml-prev-nota-valor"'), 'Card 2 NF-e deve ter elemento de valor total');
  assert.ok(html.includes('id="xml-kpi-total-itens"'), 'Card 3 De-Para deve ter KPI de total de itens');
  assert.ok(html.includes('id="xml-kpi-vinculados"'), 'Card 3 De-Para deve ter KPI de vinculados');
  assert.ok(html.includes('id="xml-kpi-pendentes"'), 'Card 3 De-Para deve ter KPI de pendentes/novos');
});

test('TICKET 04 - UI: Ergonomia de teclado com tabindex="-1" nos controles secundários e sem spinners', () => {
  const htmlPath = path.resolve('public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Botões secundários com tabindex="-1" para navegação Tab sem interrupções
  assert.ok(html.includes('class="modal-close-btn" tabindex="-1" onclick="fecharModalImportarXml()"'), 'Botão fechar ✕ deve ter tabindex="-1"');
  assert.ok(html.includes('tabindex="-1" class="btn-top btn-row-action" style="white-space: nowrap; font-size: 11.5px; border-color: rgba(56, 189, 248, 0.4); color: #38bdf8;" onclick="event.stopPropagation(); carregarXmlExemploTeste();"'), 'Botão carregar XML exemplo deve ter tabindex="-1"');
  assert.ok(html.includes('tabindex="-1" class="btn-top btn-row-action" onclick="copiarChaveXmlImportado()"'), 'Botão copiar chave deve ter tabindex="-1"');
  assert.ok(html.includes('tabindex="-1" class="btn-top btn-row-action" onclick="fecharModalImportarXml()">Cancelar</button>'), 'Botão cancelar rodapé deve ter tabindex="-1"');
});

test('TICKET 04 - UI: JavaScript controller implementa auto-aprendizagem, combobox flutuante e envio à API', () => {
  const htmlPath = path.resolve('public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('function aoArrastarSobreXmlDropzone('), 'Deve implementar aoArrastarSobreXmlDropzone');
  assert.ok(html.includes('function aoSoltarArquivoXml('), 'Deve implementar aoSoltarArquivoXml');
  assert.ok(html.includes('function enviarArquivoXmlParaApi('), 'Deve implementar envio assíncrono para a API');
  assert.ok(html.includes('function renderizarVisualizacaoXmlCompra('), 'Deve implementar renderização dos cards e tabela');
  assert.ok(html.includes('function aoMudarFatorConversaoItem('), 'Deve implementar reatividade de conversão de embalagem');
  assert.ok(html.includes('function abrirDropdownComboboxXmlItem('), 'Deve implementar abertura inteligente do combobox');
  assert.ok(html.includes('function selecionarProdutoDeParaXml('), 'Deve implementar seleção e memorização do vínculo');
  assert.ok(html.includes('function recalcularKpisDePara('), 'Deve implementar recálculo de KPIs');
  assert.ok(html.includes('function confirmarImportacaoXmlCompra('), 'Deve implementar envio atômico para /api/compras/confirmar-entrada');
});

import {
  normalizarCep,
  formatarCep,
  validarCep,
  normalizarDimensoes,
  normalizarPeso,
  estimarFreteRegional,
  MelhorEnvioAdapter,
  SuperFreteAdapter,
  CorreiosCwsAdapter,
  FrenetAdapter,
  LogisticaHub,
  cotarFreteMultiplo,
  gerarDadosEtiqueta
} from '../lib/logistica_hub.js';

test('TICKET 05 - LOGÍSTICA: Helpers de CEP, dimensões e cálculo de estimativa regional', () => {
  // CEP
  assert.strictEqual(normalizarCep('93.940-000'), '93940000');
  assert.strictEqual(formatarCep('93940000'), '93940-000');
  assert.strictEqual(validarCep('93940000'), true);
  assert.strictEqual(validarCep('11111111'), false, 'Sequência repetida deve ser rejeitada');
  assert.strictEqual(validarCep('123'), false, 'Menos de 8 dígitos deve ser rejeitado');

  // Dimensões mínimas dos Correios (16x11x2 cm)
  const dims = normalizarDimensoes({ c: 10, l: 5, a: 1 });
  assert.strictEqual(dims.comprimento, 16);
  assert.strictEqual(dims.largura, 11);
  assert.strictEqual(dims.altura, 2);

  // Peso mínimo 50g
  assert.strictEqual(normalizarPeso(0.01), 0.05);
  assert.strictEqual(normalizarPeso(2.5), 2.5);

  // Estimativa regional
  const estadualSedex = estimarFreteRegional('93940000', '93300000', 1.0, 'SEDEX'); // RS -> RS
  const interestadualSedex = estimarFreteRegional('93940000', '01310100', 1.0, 'SEDEX'); // RS -> SP

  assert.ok(estadualSedex.preco > 0);
  assert.ok(interestadualSedex.preco > estadualSedex.preco, 'Frete interestadual deve custar mais que estadual');
  assert.ok(estadualSedex.prazo_dias <= interestadualSedex.prazo_dias, 'Prazo estadual deve ser menor ou igual');
});

test('TICKET 05 - LOGÍSTICA: Adapters individuais para Melhor Envio, SuperFrete, Correios CWS e Frenet', async () => {
  const params = {
    cepOrigem: '93940000', // Lindolfo Collor - RS
    cepDestino: '01310100', // São Paulo - SP
    pesoKg: 0.8,
    dimensoes: { c: 20, l: 15, a: 10 },
    valorDeclarado: 150.0
  };

  // 1. Melhor Envio (Correios e Jadlog)
  const melhorEnvio = new MelhorEnvioAdapter({ ambiente: 'sandbox' });
  const cotacoesMe = await melhorEnvio.cotar(params);
  assert.ok(Array.isArray(cotacoesMe));
  assert.ok(cotacoesMe.length >= 3, 'Deve retornar ao menos SEDEX, PAC e Jadlog');
  assert.ok(cotacoesMe.some(c => c.servico_nome.includes('SEDEX')));
  assert.ok(cotacoesMe.some(c => c.transportadora === 'Jadlog'));

  // 2. SuperFrete (Correios com Mini Envios)
  const superFrete = new SuperFreteAdapter({});
  const cotacoesSf = await superFrete.cotar(params);
  assert.ok(Array.isArray(cotacoesSf));
  assert.ok(cotacoesSf.some(c => c.servico_nome === 'SEDEX'));
  assert.ok(cotacoesSf.some(c => c.servico_nome === 'PAC'));

  // Teste Mini Envios com pacote leve (200g)
  const cotacoesSfLeve = await superFrete.cotar({ ...params, pesoKg: 0.2 });
  assert.ok(cotacoesSfLeve.some(c => c.servico_nome === 'Mini Envios'), 'Pacote até 300g deve incluir Mini Envios');

  // 3. Correios CWS
  const cws = new CorreiosCwsAdapter({});
  const cotacoesCws = await cws.cotar(params);
  assert.ok(Array.isArray(cotacoesCws));
  assert.ok(cotacoesCws.some(c => c.servico_codigo === '03220')); // SEDEX Contrato

  // 4. Frenet Gateway
  const frenet = new FrenetAdapter({});
  const cotacoesFrenet = await frenet.cotar(params);
  assert.ok(Array.isArray(cotacoesFrenet));
  assert.ok(cotacoesFrenet.some(c => c.transportadora === 'Total Express'));
});

test('TICKET 05 - LOGÍSTICA: Cotação concorrente multi-frete com ordenação, menor preço e mais rápido', async () => {
  const configsMock = [
    { id: 'melhor_envio', nome: 'Melhor Envio', ativo: 1, padrao: 1, ambiente: 'sandbox' },
    { id: 'superfrete', nome: 'SuperFrete', ativo: 1, padrao: 0, ambiente: 'producao' },
    { id: 'frenet', nome: 'Frenet Gateway', ativo: 1, padrao: 0, ambiente: 'producao' }
  ];

  const resultado = await cotarFreteMultiplo({
    cepOrigem: '93940-000',
    cepDestino: '01310-100',
    pesoKg: 1.2,
    transportadorasConfig: configsMock
  });

  assert.strictEqual(resultado.success, true);
  assert.strictEqual(resultado.origem, '93940-000');
  assert.strictEqual(resultado.destino, '01310-100');
  assert.ok(resultado.total_opcoes > 5, 'Deve consolidar opções de múltiplos provedores');

  // Ordenação: primeiro item deve ter o menor preço
  const primeiro = resultado.opcoes[0];
  const ultimo = resultado.opcoes[resultado.opcoes.length - 1];
  assert.ok(primeiro.preco <= ultimo.preco, 'Lista consolidada deve estar ordenada por menor preço');

  // Tags analíticas
  assert.strictEqual(primeiro.menor_preco, true, 'Primeiro item deve possuir tag menor_preco');
  const maisRapido = resultado.opcoes.find(o => o.mais_rapido);
  assert.ok(maisRapido, 'Deve identificar a opção mais rápida');
  assert.ok(maisRapido.prazo_dias <= primeiro.prazo_dias);

  // Provedor padrão
  assert.strictEqual(resultado.provedor_padrao, 'melhor_envio');
  const temRecomendado = resultado.opcoes.some(o => o.recomendado_padrao);
  assert.strictEqual(temRecomendado, true, 'Deve marcar as opções do provedor padrão');
});

test('TICKET 05 - LOGÍSTICA: Resiliência contra falhas ou timeouts de provedores sem abortar cotações saudáveis', async () => {
  const hubResiliente = new LogisticaHub({
    db: {
      query: async () => [
        { id: 'melhor_envio', nome: 'Melhor Envio', ativo: 1, padrao: 1 },
        { id: 'provedor_quebrado', nome: 'Provedor Falho', ativo: 1, padrao: 0 }
      ]
    }
  });

  // Registra um adapter quebrado que estoura exceção
  hubResiliente.registrarAdapter('provedor_quebrado', {
    cotar: async () => { throw new Error('API do provedor fora do ar (503 Service Unavailable)'); }
  });

  // Registra um adapter saudável
  hubResiliente.registrarAdapter('melhor_envio', new MelhorEnvioAdapter({}));

  const res = await hubResiliente.cotarFreteMultiplo({
    cepOrigem: '93940000',
    cepDestino: '90010000',
    pesoKg: 0.5,
    transportadorasConfig: [
      { id: 'melhor_envio', nome: 'Melhor Envio', ativo: 1, padrao: 1 },
      { id: 'provedor_quebrado', nome: 'Provedor Falho', ativo: 1, padrao: 0 }
    ]
  });

  assert.strictEqual(res.success, true);
  assert.ok(res.total_opcoes > 0, 'Mesmo com falha de um provedor, deve retornar opções saudáveis');
  
  const relatorioFalho = res.provedores_consultados.find(p => p.provedor_id === 'provedor_quebrado');
  assert.ok(relatorioFalho);
  assert.strictEqual(relatorioFalho.sucesso, false);
  assert.ok(relatorioFalho.erro.includes('fora do ar'));
});

test('TICKET 05 - LOGÍSTICA: Geração de dados de etiquetas térmicas e A4 com código de rastreamento', () => {
  const pedidoMock = {
    id: 1045,
    numero_pedido: '#PED-1045',
    cliente_nome: 'GUSTAVO ROSA',
    cliente_cpf: '012.345.678-99',
    endereco: 'RUA DAS FLORES',
    numero: '123',
    bairro: 'CENTRO',
    cidade: 'PORTO ALEGRE',
    uf: 'RS',
    cep: '90010-000',
    telefone: '(51) 98765-4321',
    valor_total: 280.00,
    itens_descricao: '1X POLTRONA RETRÔ COURO CARAMELO'
  };

  const cotacaoMock = {
    transportadora: 'Correios',
    servico_nome: 'SEDEX',
    preco: 28.50,
    prazo_dias: 2,
    peso_kg: 2.5,
    valor_declarado: 280.00
  };

  // Etiqueta Térmica 100x150 mm
  const etiquetaTermica = gerarDadosEtiqueta({
    pedido: pedidoMock,
    cotacao: cotacaoMock,
    formato: 'termica_100x150'
  });

  assert.strictEqual(etiquetaTermica.success, true);
  assert.strictEqual(etiquetaTermica.formato_etiqueta, 'termica_100x150');
  assert.strictEqual(etiquetaTermica.dimensoes_etiqueta_mm.largura, 100);
  assert.strictEqual(etiquetaTermica.dimensoes_etiqueta_mm.altura, 150);
  assert.ok(etiquetaTermica.codigo_rastreio.startsWith('SL'), 'SEDEX Correios deve iniciar com SL');
  assert.ok(etiquetaTermica.codigo_rastreio.endsWith('BR'));
  assert.ok(etiquetaTermica.url_rastreio.includes('rastreamento.correios.com.br'));
  assert.strictEqual(etiquetaTermica.destinatario.nome, 'GUSTAVO ROSA');
  assert.strictEqual(etiquetaTermica.destinatario.cep, '90010-000');

  // Etiqueta Jadlog
  const etiquetaJadlog = gerarDadosEtiqueta({
    pedido: pedidoMock,
    cotacao: { ...cotacaoMock, transportadora: 'Jadlog', servico_nome: 'Jadlog .Package' },
    formato: 'folha_a4'
  });

  assert.strictEqual(etiquetaJadlog.formato_etiqueta, 'folha_a4');
  assert.ok(etiquetaJadlog.codigo_rastreio.startsWith('18'), 'Jadlog deve iniciar com 18');
  assert.ok(etiquetaJadlog.url_rastreio.includes('jadlog.com.br'));
});

import handlerLogistica from '../api/logistica.js';

test('TICKET 06 - API: POST /api/logistica/cotar retorna opções concorrentes e ordenadas', async () => {
  const req = {
    method: 'POST',
    url: '/api/logistica/cotar',
    body: {
      cepOrigem: '93940-000',
      cepDestino: '01310-100',
      pesoKg: 1.5,
      dimensoes: { c: 25, l: 20, a: 15 }
    }
  };
  const res = criarMockRes();

  await handlerLogistica(req, res);

  assert.strictEqual(res.getStatusCode(), 200);
  const data = res.getData();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.origem, '93940-000');
  assert.strictEqual(data.destino, '01310-100');
  assert.ok(data.total_opcoes > 0);
  assert.ok(Array.isArray(data.opcoes));
  assert.ok(data.destaques.menor_preco);
  assert.ok(data.destaques.mais_rapido);
});

test('TICKET 06 - API: GET /api/logistica/configuracoes retorna transportadoras com tokens mascarados', async () => {
  const req = {
    method: 'GET',
    url: '/api/logistica/configuracoes'
  };
  const res = criarMockRes();

  await handlerLogistica(req, res);

  assert.strictEqual(res.getStatusCode(), 200);
  const data = res.getData();
  assert.strictEqual(data.sucesso, true);
  assert.ok(Array.isArray(data.transportadoras));
  assert.ok(data.transportadoras.length >= 4);

  // Valida que tokens reais não vazam na API
  data.transportadoras.forEach(t => {
    assert.strictEqual(t.token_acesso, undefined, 'token_acesso bruto não deve ser exposto');
    assert.ok(t.token_mascarado !== undefined, 'Deve conter token_mascarado');
  });
});

test('TICKET 06 - API: POST /api/logistica/configuracoes atualiza status e define transportadora padrão unívoca', async () => {
  // Define superfrete como padrão
  const req1 = {
    method: 'POST',
    url: '/api/logistica/configuracoes',
    body: {
      id: 'superfrete',
      ativo: 1,
      padrao: 1,
      ambiente: 'producao',
      formato_etiqueta_padrao: 'termica_100x150'
    }
  };
  const res1 = criarMockRes();
  await handlerLogistica(req1, res1);

  assert.strictEqual(res1.getStatusCode(), 200);
  const data1 = res1.getData();
  assert.strictEqual(data1.sucesso, true);
  assert.strictEqual(data1.transportadora.padrao, 1);
  assert.strictEqual(data1.transportadora.ativo, 1);

  // Confere no banco que apenas superfrete está como padrão (unicidade)
  const padroes = await db.query('SELECT id FROM transportadoras_config WHERE padrao = 1');
  assert.strictEqual(padroes.length, 1, 'Apenas 1 provedor pode ser padrão');
  assert.strictEqual(padroes[0].id, 'superfrete');

  // Restaura melhor_envio como padrão para manter consistência dos testes
  const req2 = {
    method: 'POST',
    url: '/api/logistica/configuracoes',
    body: {
      id: 'melhor_envio',
      ativo: 1,
      padrao: 1,
      ambiente: 'sandbox'
    }
  };
  const res2 = criarMockRes();
  await handlerLogistica(req2, res2);
  assert.strictEqual(res2.getStatusCode(), 200);
});

test('TICKET 06 - API: POST /api/logistica/gerar-etiqueta emite etiqueta térmica e atualiza rastreio no pedido', async () => {
  // Cria um pedido de teste
  const agora = new Date().toISOString();
  const resPed = await db.run(`
    INSERT INTO pedidos (
      numero, cliente_nome, telefone, cidade, uf, itens, valor_total, status, status_texto, data_pedido, data_atualizacao
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    '#TESTE-ETIQ-01', 'GUSTAVO ROSA TESTE', '(51) 99999-8888', 'PORTO ALEGRE', 'RS', '1X POLTRONA RETRÔ', 350.00, 'EM_SEPARACAO', 'Em Separação', agora, agora
  ]);
  const pedidoId = resPed.lastInsertRowid;

  const req = {
    method: 'POST',
    url: '/api/logistica/gerar-etiqueta',
    body: {
      pedidoId,
      formato: 'termica_100x150',
      cotacao: {
        transportadora: 'Correios',
        servico_nome: 'SEDEX',
        preco: 25.0
      }
    }
  };
  const res = criarMockRes();

  await handlerLogistica(req, res);

  assert.strictEqual(res.getStatusCode(), 200);
  const data = res.getData();
  assert.strictEqual(data.sucesso, true);
  assert.ok(data.etiqueta);
  assert.ok(data.etiqueta.codigo_rastreio);
  assert.strictEqual(data.etiqueta.formato_etiqueta, 'termica_100x150');

  // Confere que o pedido no banco foi atualizado para AGUARDANDO_ENVIO e recebeu código de rastreamento
  const pedAtualizado = await db.get('SELECT * FROM pedidos WHERE id = ?', [pedidoId]);
  assert.ok(pedAtualizado);
  assert.strictEqual(pedAtualizado.codigo_rastreio, data.etiqueta.codigo_rastreio);
  assert.strictEqual(pedAtualizado.transportadora, 'Correios');
  assert.strictEqual(pedAtualizado.status, 'AGUARDANDO_ENVIO');

  // Limpeza
  await db.run('DELETE FROM pedidos WHERE id = ?', [pedidoId]);
});

test('TICKET 07 - UI: Modal de Expedição possui painel de cotação multi-frete, container de cards e preview de rastreio', () => {
  const htmlPath = path.resolve('public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Elementos do painel de cotação multi-frete
  assert.ok(html.includes('id="etiqueta-cep-destino"'), 'Deve conter input de CEP destino');
  assert.ok(html.includes('id="etiqueta-dest-resumo"'), 'Deve conter resumo do destinatário');
  assert.ok(html.includes('id="etiqueta-loading-cotacao"'), 'Deve conter feedback de loading da cotação');
  assert.ok(html.includes('id="etiqueta-cards-cotacao"'), 'Deve conter container de cards de cotação');
  assert.ok(html.includes('onclick="cotarFreteMultiProvedores()"'), 'Deve possuir botão disparando cotarFreteMultiProvedores');

  // Preview com rastreio dinâmico
  assert.ok(html.includes('id="etq-rastreio-badge-wrap"'), 'Deve conter badge de código de rastreio no preview');
  assert.ok(html.includes('id="etq-rastreio-codigo"'), 'Deve conter elemento para o código de rastreamento oficial');

  // Atalhos na tabela e no menu de contexto
  assert.ok(html.includes('abrirModalCotarFretePedido(${ped.id})'), 'Tabela de pedidos deve conter botão de cotar frete');
  assert.ok(html.includes('abrirModalCotarFretePedido(${p.id})'), 'Menu de contexto deve conter atalho de cotar frete');
});

test('TICKET 07 - UI: JavaScript controller implementa cotação em 1 clique, badges de menor preço e envio WhatsApp', () => {
  const htmlPath = path.resolve('public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Métodos do controller de expedição
  assert.ok(html.includes('function abrirModalCotarFretePedido('), 'Deve implementar abrirModalCotarFretePedido');
  assert.ok(html.includes('async function cotarFreteMultiProvedores('), 'Deve implementar cotarFreteMultiProvedores');
  assert.ok(html.includes('function renderizarOpcoesFreteCotadas('), 'Deve implementar renderizarOpcoesFreteCotadas');
  assert.ok(html.includes('async function selecionarOpcaoFrete('), 'Deve implementar selecionarOpcaoFrete');
  assert.ok(html.includes('function enviarEtiquetaWhatsApp('), 'Deve implementar enviarEtiquetaWhatsApp');

  // Badges visuais comparativas e ergonomia
  assert.ok(html.includes('MENOR PREÇO'), 'Deve conter badge analítica de Menor Preço');
  assert.ok(html.includes('MAIS RÁPIDO'), 'Deve conter badge analítica de Mais Rápido');
  assert.ok(html.includes('tabindex="-1" style="justify-content: center; padding: 8px 10px; font-size: 11.5px; background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4);" onclick="enviarEtiquetaWhatsApp()"'), 'Botão de WhatsApp deve ter tabindex="-1"');
});

import {
  parseOfx,
  parseCsvBancario,
  calcularScoreMatching,
  conciliarExtratoComLancamentos
} from '../lib/conciliacao_bancaria.js';

test('TICKET 08 - CONCILIAÇÃO: Parser OFX extrai metadados, FITID, datas, valores e tipo (SGML/XML)', () => {
  const exemploOfxSgml = `
OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20261110120000[-03:BRT]
<LANGUAGE>POR
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1001
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>341
<BRANCHID>1234
<ACCTID>56789-0
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20261101120000[-03:BRT]
<DTEND>20261110120000[-03:BRT]
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261105120000[-03:BRT]
<TRNAMT>450.00
<FITID>202611050001
<CHECKNUM>001
<MEMO>PIX RECEBIDO - GUSTAVO ROSA
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261108120000[-03:BRT]
<TRNAMT>-280.50
<FITID>202611080002
<MEMO>PAGTO FORNECEDOR COUROS LTDA
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>5840.20
<DTASOF>20261110120000[-03:BRT]
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
  `;

  const parsed = parseOfx(exemploOfxSgml);

  assert.strictEqual(parsed.success, true);
  assert.strictEqual(parsed.banco, '341');
  assert.strictEqual(parsed.conta, '56789-0');
  assert.strictEqual(parsed.moeda, 'BRL');
  assert.strictEqual(parsed.saldoFinal, 5840.20);
  assert.strictEqual(parsed.totalTransacoes, 2);
  assert.strictEqual(parsed.totalCreditos, 450.00);
  assert.strictEqual(parsed.totalDebitos, 280.50);

  // Transação 1: Crédito
  const tr1 = parsed.transacoes[0];
  assert.strictEqual(tr1.fitid, '202611050001');
  assert.strictEqual(tr1.tipo, 'CREDITO');
  assert.strictEqual(tr1.valor, 450.00);
  assert.strictEqual(tr1.data, '2026-11-05');
  assert.strictEqual(tr1.descricao, 'PIX RECEBIDO - GUSTAVO ROSA');

  // Transação 2: Débito
  const tr2 = parsed.transacoes[1];
  assert.strictEqual(tr2.fitid, '202611080002');
  assert.strictEqual(tr2.tipo, 'DEBITO');
  assert.strictEqual(tr2.valor, 280.50);
  assert.strictEqual(tr2.valor_bruto, -280.50);
  assert.strictEqual(tr2.data, '2026-11-08');
  assert.strictEqual(tr2.descricao, 'PAGTO FORNECEDOR COUROS LTDA');
});

test('TICKET 08 - CONCILIAÇÃO: Parser CSV detecta delimitador, trata formatos brasileiros e gera FITIDs', () => {
  // Exemplo CSV estilo Nubank / Inter com ponto e vírgula
  const csvPontoVirgula = `Data;Historico;Valor;Identificador
05/11/2026;TRANSFERENCIA RECEBIDA - CLIENTE MARCOS;1250,00;NUB_001
07/11/2026;PAGAMENTO DE BOLETO FORNECEDOR;-320,80;NUB_002
10/11/2026;TARIFA MANUTENCAO CONTA;-12,50;NUB_003`;

  const parsed = parseCsvBancario(csvPontoVirgula, { banco: 'NUBANK' });

  assert.strictEqual(parsed.success, true);
  assert.strictEqual(parsed.delimitador, ';');
  assert.strictEqual(parsed.totalTransacoes, 3);
  assert.strictEqual(parsed.totalCreditos, 1250.00);
  assert.strictEqual(parsed.totalDebitos, 333.30); // 320.80 + 12.50 = 333.30

  assert.strictEqual(parsed.transacoes[0].tipo, 'CREDITO');
  assert.strictEqual(parsed.transacoes[0].valor, 1250.00);
  assert.strictEqual(parsed.transacoes[0].data, '2026-11-05');
  assert.strictEqual(parsed.transacoes[0].fitid, 'NUB_001');

  assert.strictEqual(parsed.transacoes[1].tipo, 'DEBITO');
  assert.strictEqual(parsed.transacoes[1].valor, 320.80);
  assert.strictEqual(parsed.transacoes[1].data, '2026-11-07');

  // Exemplo CSV com vírgula e colunas em inglês
  const csvVirgula = `Date,Memo,Amount
2026-11-09,"DEP PIX CLIENTE",800.00
2026-11-10,"COMPRA MATERIAIS",-150.00`;

  const parsedVirgula = parseCsvBancario(csvVirgula, { banco: 'INTER' });
  assert.strictEqual(parsedVirgula.success, true);
  assert.strictEqual(parsedVirgula.delimitador, ',');
  assert.strictEqual(parsedVirgula.totalTransacoes, 2);
  assert.strictEqual(parsedVirgula.transacoes[0].valor, 800.00);
  assert.strictEqual(parsedVirgula.transacoes[1].valor, 150.00);
});

test('TICKET 08 - CONCILIAÇÃO: Motor Heurístico de Score (1.0 exato, 0.8 data próxima, 0.5 diferença de centavos, 0.0 incompatível)', () => {
  const transacaoExtrato = {
    tipo: 'CREDITO',
    valor: 500.00,
    data: '2026-11-10',
    descricao: 'PIX RECEBIDO GUSTAVO ROSA'
  };

  // 1. Match Perfeito (Score 1.0)
  const erpPerfeito = {
    id: 101,
    tipo: 'RECEBER',
    valor: 500.00,
    data_vencimento: '2026-11-10',
    cliente_nome: 'GUSTAVO ROSA',
    status: 'PENDENTE'
  };
  const scorePerfeito = calcularScoreMatching(transacaoExtrato, erpPerfeito);
  assert.strictEqual(scorePerfeito.score, 1.0, 'Mesmo valor, data exata e cliente deve ter Score 1.0');
  assert.strictEqual(scorePerfeito.confianca, 'ALTA');
  assert.strictEqual(scorePerfeito.auto_conciliavel, true);

  // 2. Match Forte com Data Próxima (Score 0.85 a 0.95)
  const erpDataProxima = {
    id: 102,
    tipo: 'RECEBER',
    valor: 500.00,
    data_vencimento: '2026-11-12', // 2 dias depois
    cliente_nome: 'GUSTAVO ROSA',
    status: 'PENDENTE'
  };
  const scoreData = calcularScoreMatching(transacaoExtrato, erpDataProxima);
  assert.ok(scoreData.score >= 0.85 && scoreData.score <= 0.95, 'Data em +/- 2 dias deve ter score forte');

  // 3. Match com Divergência de Centavos / Tarifas (Score moderado ~0.65)
  const erpCentavos = {
    id: 103,
    tipo: 'RECEBER',
    valor: 501.50, // 1.50 de tarifa bancária
    data_vencimento: '2026-11-10',
    cliente_nome: 'GUSTAVO ROSA',
    status: 'PENDENTE'
  };
  const scoreCentavos = calcularScoreMatching(transacaoExtrato, erpCentavos);
  assert.ok(scoreCentavos.score >= 0.50 && scoreCentavos.score < 0.85, 'Diferença de centavos deve ter score moderado');

  // 4. Fluxo Incompatível (Score 0.0)
  const erpFluxoIncompativel = {
    id: 104,
    tipo: 'PAGAR', // Débito contra crédito
    valor: 500.00,
    data_vencimento: '2026-11-10',
    cliente_nome: 'GUSTAVO ROSA'
  };
  const scoreIncompativel = calcularScoreMatching(transacaoExtrato, erpFluxoIncompativel);
  assert.strictEqual(scoreIncompativel.score, 0.0);
  assert.strictEqual(scoreIncompativel.confianca, 'INCOMPATIVEL');

  // 5. Valor Totalmente Divergente (Score 0.0)
  const erpValorDivergente = {
    id: 105,
    tipo: 'RECEBER',
    valor: 1500.00,
    data_vencimento: '2026-11-10'
  };
  const scoreValor = calcularScoreMatching(transacaoExtrato, erpValorDivergente);
  assert.strictEqual(scoreValor.score, 0.0);
});

test('TICKET 08 - CONCILIAÇÃO: Reconciliação em lote sem duplicação de lançamentos casados', () => {
  const transacoesExtrato = [
    { fitid: 'EXT_01', tipo: 'CREDITO', valor: 200.00, data: '2026-11-10', descricao: 'DOC PEDIDO 101' },
    { fitid: 'EXT_02', tipo: 'CREDITO', valor: 200.00, data: '2026-11-10', descricao: 'DOC PEDIDO 102' },
    { fitid: 'EXT_03', tipo: 'DEBITO', valor: 90.00, data: '2026-11-11', descricao: 'TARIFA BANCARIA DESCONHECIDA' }
  ];

  const lancamentosErp = [
    { id: 1, tipo: 'RECEBER', valor: 200.00, data_vencimento: '2026-11-10', descricao: 'PEDIDO 101', status: 'PENDENTE' },
    { id: 2, tipo: 'RECEBER', valor: 200.00, data_vencimento: '2026-11-10', descricao: 'PEDIDO 102', status: 'PENDENTE' }
  ];

  const resultado = conciliarExtratoComLancamentos(transacoesExtrato, lancamentosErp);

  assert.strictEqual(resultado.success, true);
  assert.strictEqual(resultado.total_transacoes, 3);
  assert.strictEqual(resultado.total_auto_conciliavel, 2);
  assert.strictEqual(resultado.total_com_match, 2);
  assert.strictEqual(resultado.total_sem_match, 1);

  // Valida que as duas transações de 200 não casaram com o mesmo lançamento (id 1 e id 2 únicos)
  const match1 = resultado.resultados[0];
  const match2 = resultado.resultados[1];
  assert.notStrictEqual(match1.sugestao.lancamento_id, match2.sugestao.lancamento_id, 'Não pode casar duas transações com o mesmo lançamento');

  // Item 3 sem match
  const match3 = resultado.resultados[2];
  assert.strictEqual(match3.possui_match, false);
  assert.strictEqual(match3.confianca, 'SEM_MATCH');
});







import handlerFinanceiro from '../api/financeiro.js';

test('TICKET 09 - API: POST /api/financeiro/conciliacao/upload com OFX e conciliação heurística', async () => {
  const descTeste = 'TESTE VENDA COUROS PEDIDO 8888';
  await db.run('DELETE FROM financeiro_lancamentos WHERE descricao = ?', [descTeste]);
  const insertRes = await db.run(`
    INSERT INTO financeiro_lancamentos (
      tipo, origem, descricao, categoria, valor, data_vencimento, status, data_cadastro
    ) VALUES ('RECEBER', 'PEDIDO', ?, 'VENDAS', 350.00, '2026-11-10', 'PENDENTE', '2026-11-10T10:00:00Z')
  `, [descTeste]);
  const lancamentoId = insertRes.lastInsertRowid;

  const ofxExemplo = `
OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>260
<ACCTID>12345-6
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20261110
<DTEND>20261110
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261110120000[-03:BRT]
<TRNAMT>350.00
<FITID>OFX_TEST_8888_01
<MEMO>PIX TESTE VENDA COUROS PEDIDO 8888
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>1500.00
<DTASOF>20261110120000[-03:BRT]
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
  `;

  await db.run('DELETE FROM conciliacao_extratos WHERE fitid = ?', ['OFX_TEST_8888_01']);

  const req = {
    method: 'POST',
    url: '/api/financeiro/conciliacao/upload',
    body: {
      conteudo: ofxExemplo,
      tipoArquivo: 'OFX'
    }
  };
  const res = criarMockRes();

  await handlerFinanceiro(req, res);

  assert.strictEqual(res.getStatusCode(), 200);
  const data = res.getData();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.totalTransacoes, 1);
  assert.strictEqual(data.total_auto_conciliavel, 1);
  assert.strictEqual(data.transacoes.length, 1);
  assert.strictEqual(data.transacoes[0].transacao_extrato.fitid, 'OFX_TEST_8888_01');
  assert.strictEqual(data.transacoes[0].sugestao.lancamento_id, lancamentoId);
  assert.strictEqual(data.transacoes[0].score, 1.0);

  const registro = await db.get('SELECT * FROM conciliacao_extratos WHERE fitid = ?', ['OFX_TEST_8888_01']);
  assert.ok(registro, 'Registro no banco conciliacao_extratos deve existir');
  assert.strictEqual(registro.status, 'PENDENTE');
  assert.strictEqual(Number(registro.score_match), 1.0);

  await db.run('DELETE FROM conciliacao_extratos WHERE fitid = ?', ['OFX_TEST_8888_01']);
  await db.run('DELETE FROM financeiro_lancamentos WHERE id = ?', [lancamentoId]);
});

test('TICKET 09 - API: POST /api/financeiro/conciliacao/reconciliar-lote com baixa e taxa bancária', async () => {
  const descTeste = 'TESTE BOLETO CLIENTE 9999';
  const insertLanc = await db.run(`
    INSERT INTO financeiro_lancamentos (
      tipo, origem, descricao, categoria, valor, data_vencimento, status, data_cadastro
    ) VALUES ('RECEBER', 'PEDIDO', ?, 'VENDAS', 100.00, '2026-11-10', 'PENDENTE', '2026-11-10T10:00:00Z')
  `, [descTeste]);
  const lancId = insertLanc.lastInsertRowid;

  const fitidTeste = 'FITID_RECON_LOTE_01';
  await db.run('DELETE FROM conciliacao_extratos WHERE fitid = ?', [fitidTeste]);
  await db.run(`
    INSERT INTO conciliacao_extratos (
      origem, fitid, data_transacao, descricao, tipo, valor, status, transacao_financeiro_id, score_match, criado_em
    ) VALUES ('OFX', ?, '2026-11-10', 'CRED LIQ BOLETO 9999', 'CREDITO', 98.50, 'PENDENTE', ?, 0.85, '2026-11-10T10:00:00Z')
  `, [fitidTeste, lancId]);

  const req = {
    method: 'POST',
    url: '/api/financeiro/conciliacao/reconciliar-lote',
    body: {
      reconciliacoes: [
        {
          fitid: fitidTeste,
          lancamento_id: lancId,
          data_pagamento: '2026-11-10',
          diferenca_tarifa: 1.50
        }
      ]
    }
  };
  const res = criarMockRes();

  await handlerFinanceiro(req, res);

  assert.strictEqual(res.getStatusCode(), 200);
  const data = res.getData();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.total_reconciliados, 1);
  assert.strictEqual(data.total_tarifas_ajustadas, 1);

  const lancAtualizado = await db.get('SELECT * FROM financeiro_lancamentos WHERE id = ?', [lancId]);
  assert.strictEqual(lancAtualizado.status, 'PAGO');
  assert.strictEqual(lancAtualizado.data_pagamento, '2026-11-10');

  const tarifaGerada = await db.get(`
    SELECT * FROM financeiro_lancamentos 
    WHERE categoria = 'TARIFAS BANCÁRIAS' AND observacoes LIKE ?
  `, [`%#${lancId}%`]);
  assert.ok(tarifaGerada, 'Despesa de tarifa bancária deve ter sido gerada');
  assert.strictEqual(tarifaGerada.tipo, 'PAGAR');
  assert.strictEqual(Number(tarifaGerada.valor), 1.50);
  assert.strictEqual(tarifaGerada.status, 'PAGO');

  const extratoAtualizado = await db.get('SELECT * FROM conciliacao_extratos WHERE fitid = ?', [fitidTeste]);
  assert.strictEqual(extratoAtualizado.status, 'CONCILIADO');

  await db.run('DELETE FROM conciliacao_extratos WHERE fitid = ?', [fitidTeste]);
  await db.run('DELETE FROM financeiro_lancamentos WHERE id = ?', [lancId]);
  if (tarifaGerada) {
    await db.run('DELETE FROM financeiro_lancamentos WHERE id = ?', [tarifaGerada.id]);
  }
});

test('TICKET 09 - API: GET /api/financeiro/conciliacao/extratos lista registros com filtros', async () => {
  const fitidFiltro = 'FITID_EXTRATO_FILTRO_01';
  await db.run('DELETE FROM conciliacao_extratos WHERE fitid = ?', [fitidFiltro]);
  await db.run(`
    INSERT INTO conciliacao_extratos (
      origem, fitid, data_transacao, descricao, tipo, valor, status, criado_em
    ) VALUES ('CSV', ?, '2026-11-10', 'TRANSFERENCIA FILTRO', 'CREDITO', 250.00, 'CONCILIADO', '2026-11-10T10:00:00Z')
  `, [fitidFiltro]);

  const req = {
    method: 'GET',
    url: '/api/financeiro/conciliacao/extratos?status=CONCILIADO'
  };
  const res = criarMockRes();

  await handlerFinanceiro(req, res);

  assert.strictEqual(res.getStatusCode(), 200);
  const data = res.getData();
  assert.strictEqual(data.success, true);
  assert.ok(Array.isArray(data.extratos));
  const achado = data.extratos.find(e => e.fitid === fitidFiltro);
  assert.ok(achado, 'Deve encontrar o extrato inserido no filtro de CONCILIADO');

  await db.run('DELETE FROM conciliacao_extratos WHERE fitid = ?', [fitidFiltro]);
});


test('TICKET 10 - UI: Modal #modal-conciliacao-bancaria possui dropzone, resumo e tabela comparativa', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');

  // 1. Botão no Financeiro
  assert.ok(html.includes('abrirModalConciliacaoBancaria()'), 'Botão de abrir conciliação deve existir no financeiro');

  // 2. Estrutura do Modal
  assert.ok(html.includes('id="modal-conciliacao-bancaria"'), 'Modal de conciliação bancária deve existir');
  assert.ok(html.includes('id="conciliacao-dropzone"'), 'Dropzone de arquivo de extrato deve existir');
  assert.ok(html.includes('id="conciliacao-resumo-painel"'), 'Painel de resumo analítico deve existir');
  assert.ok(html.includes('id="conciliacao-tbody"'), 'Tabela de conciliação lado a lado deve existir');
  assert.ok(html.includes('id="btn-confirmar-conciliacao"'), 'Botão de confirmação de baixa em lote deve existir');

  // 3. Ergonomia e Padrões
  assert.ok(html.includes('onclick="fecharModalConciliacaoBancaria()"'), 'Botão fechar modal deve chamar fecharModalConciliacaoBancaria');
  assert.ok(html.includes('tabindex="-1" onclick="fecharModalConciliacaoBancaria()"'), 'Botão fechar deve ter tabindex="-1"');
});

test('TICKET 10 - UI: JavaScript controller de conciliação bancária implementa upload, score, seleção e baixa em lote', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');

  assert.ok(html.includes('function abrirModalConciliacaoBancaria()'), 'Função abrirModalConciliacaoBancaria deve estar definida');
  assert.ok(html.includes('function fecharModalConciliacaoBancaria()'), 'Função fecharModalConciliacaoBancaria deve estar definida');
  assert.ok(html.includes('function processarArquivoConciliacao('), 'Função processarArquivoConciliacao deve estar definida');
  assert.ok(html.includes('function renderizarPainelConciliacao('), 'Função renderizarPainelConciliacao deve estar definida');
  assert.ok(html.includes('function filtrarTabelaConciliacao('), 'Função filtrarTabelaConciliacao deve estar definida');
  assert.ok(html.includes('function confirmarConciliacaoLote()'), 'Função confirmarConciliacaoLote deve estar definida');
  assert.ok(html.includes('/api/financeiro/conciliacao/reconciliar-lote'), 'Deve disparar chamada ao endpoint de conciliação em lote');
});


import {
  FiscalHub,
  gerarChaveAcessoNfe,
  calcularDvChaveAcesso,
  formatarChaveAcesso,
  validarCertificadoA1,
  montarXmlNfe55,
  gerarDanfeHtml
} from '../lib/fiscal_hub.js';
import handlerNfe from '../api/nfe.js';

test('TICKET 11 - FISCAL HUB: Geração de Chave de Acesso Oficial de 44 dígitos com Dígito Verificador Módulo 11 SEFAZ', () => {
  const base43 = '4326110000000000019155001000000001188888888';
  const dv = calcularDvChaveAcesso(base43);
  assert.strictEqual(dv.length, 1);
  assert.match(dv, /^[0-9]$/);

  const chave = gerarChaveAcessoNfe({
    uf: 'RS',
    dataEmissao: new Date('2026-11-10T12:00:00Z'),
    cnpj: '00000000000191',
    modelo: '55',
    serie: 1,
    numero: 777,
    codigoNumerico: '12345678'
  });

  assert.strictEqual(chave.length, 44, 'A chave de acesso deve ter exatamente 44 dígitos');
  assert.strictEqual(chave.slice(0, 2), '43', 'UF do RS é 43');
  assert.strictEqual(chave.slice(2, 6), '2611', 'Ano e mês 2611');
  assert.strictEqual(chave.slice(20, 22), '55', 'Modelo 55');
  assert.strictEqual(chave.slice(22, 25), '001', 'Série 001');
  assert.strictEqual(chave.slice(25, 34), '000000777', 'Número 777');

  const formatada = formatarChaveAcesso(chave);
  assert.strictEqual(formatada.split(' ').length, 11, 'Deve ser formatada em 11 blocos de 4 dígitos');
});

test('TICKET 11 - FISCAL HUB: Validação de Certificado Digital A1 (.pfx) e extração de vigência/CNPJ', () => {
  const resVazio = validarCertificadoA1(Buffer.alloc(0), '1234');
  assert.strictEqual(resVazio.valido, false);

  const mockPfx = Buffer.from('MOCK_PFX_CERTIFICATE_CN=EMPRESA TESTE LTDA:00000000000191', 'utf8');
  const resMock = validarCertificadoA1(mockPfx, 'senha123');
  assert.strictEqual(resMock.valido, true);
  assert.strictEqual(resMock.expirado, false);
  assert.ok(resMock.diasRestantes > 0);
  assert.strictEqual(resMock.cnpj, '00000000000191');
});

test('TICKET 11 - FISCAL HUB: Montagem de XML NF-e Modelo 55 e geração de layout DANFE HTML', () => {
  const chave = '43261100000000000191550010000007771123456781';
  const xml = montarXmlNfe55({
    chaveAcesso: chave,
    numero: 777,
    serie: 1,
    emitente: { cnpj: '00000000000191', razaoSocial: 'MIS SUEÑOS', uf: 'RS' },
    destinatario: { nome: 'GUSTAVO ROSA', documento: '11122233344', uf: 'RS' },
    itens: [
      { codigo: '01', descricao: 'PELE CAPRINA RÚSTICA', ncm: '41079110', cfop: '5102', valor_total: 115.00, valor_unitario: 115.00, quantidade: 1 }
    ],
    totais: { valor_total: 115.00 }
  });

  assert.ok(xml.includes('<NFe xmlns="http://www.portalfiscal.inf.br/nfe">'), 'XML deve conter tag NFe');
  assert.ok(xml.includes(`Id="NFe${chave}"`), 'XML deve conter Id da chave de 44 dígitos');
  assert.ok(xml.includes('<NCM>41079110</NCM>'), 'XML deve conter o NCM validado');
  assert.ok(xml.includes('<CFOP>5102</CFOP>'), 'XML deve conter o CFOP 5102');

  const danfe = gerarDanfeHtml({
    chaveAcesso: chave,
    numero: 777,
    serie: 1,
    emitente: { razaoSocial: 'MIS SUEÑOS' },
    destinatario: { nome: 'GUSTAVO ROSA' },
    itens: [{ codigo: '01', descricao: 'PELE CAPRINA', valor_total: 115.00 }],
    totais: { valor_total: 115.00 }
  });

  assert.ok(danfe.includes('<!DOCTYPE html>'), 'DANFE deve ser um documento HTML');
  assert.ok(danfe.includes('DANFE'), 'DANFE deve conter título');
  assert.ok(danfe.includes('4326 1100'), 'DANFE deve conter a chave de acesso formatada');
});

test('TICKET 12 - API: POST /api/nfe emite NF-e Modelo 55 e grava em fiscal_documentos', async () => {
  const req = {
    method: 'POST',
    url: '/api/nfe',
    body: {
      tipoNota: 'NFE_PRODUTO',
      cliente: {
        nome: 'GUSTAVO ROSA TICKET 12',
        cpf: '11122233344',
        uf: 'RS',
        cidade: 'Sapiranga'
      },
      produtos: [
        {
          codigo: 'SKU-FISCAL-01',
          descricao: 'MANTA DE COURO LEGÍTIMO',
          ncm: '42050000',
          quantidade: 1,
          valor_unitario: 180.00,
          valor_total: 180.00
        }
      ]
    }
  };
  const res = criarMockRes();

  await handlerNfe(req, res);

  assert.strictEqual(res.getStatusCode(), 201);
  const data = res.getData();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.tipoNota, 'NFE_PRODUTO');
  assert.strictEqual(data.status, 'AUTORIZADO');
  assert.strictEqual(data.chaveAcesso.length, 44);
  assert.strictEqual(data.valorTotal, 180.00);

  const registro = await db.get('SELECT * FROM fiscal_documentos WHERE chave_acesso = ?', [data.chaveAcesso]);
  assert.ok(registro, 'Documento fiscal deve ser persistido em fiscal_documentos');
  assert.strictEqual(registro.status, 'AUTORIZADO');
  assert.ok(registro.xml_assinado && registro.xml_assinado.includes('180.00'), 'XML assinado deve conter o valor da nota');

  await db.run('DELETE FROM fiscal_documentos WHERE chave_acesso = ?', [data.chaveAcesso]);
});

test('TICKET 12 - API: GET /api/nfe/danfe/:chave e GET /api/nfe/xml/:chave retornam DANFE e XML com headers corretos', async () => {
  const chaveTeste = '43261100000000000191550010000009991123456789';
  await db.run('DELETE FROM fiscal_documentos WHERE chave_acesso = ?', [chaveTeste]);
  await db.run(`
    INSERT INTO fiscal_documentos (
      tipo, serie, numero, chave_acesso, status, motivo_status, protocolo_autorizacao, xml_assinado, emitido_em
    ) VALUES ('NFE_55', '1', '999', ?, 'AUTORIZADO', 'Autorizado', '14326000000999', '<NFe><infNFe>XML TESTE</infNFe></NFe>', '2026-11-10T12:00:00Z')
  `, [chaveTeste]);

  const reqDanfe = {
    method: 'GET',
    url: `/api/nfe/danfe/${chaveTeste}`
  };
  const resDanfe = criarMockRes();
  await handlerNfe(reqDanfe, resDanfe);
  assert.strictEqual(resDanfe.getStatusCode(), 200);
  const dataDanfe = resDanfe.getData();
  assert.ok(typeof dataDanfe === 'string' && dataDanfe.includes('DANFE'));

  const reqXml = {
    method: 'GET',
    url: `/api/nfe/xml/${chaveTeste}`
  };
  const resXml = criarMockRes();
  await handlerNfe(reqXml, resXml);
  assert.strictEqual(resXml.getStatusCode(), 200);
  const dataXml = resXml.getData();
  assert.ok(typeof dataXml === 'string' && dataXml.includes('<NFe>'));

  await db.run('DELETE FROM fiscal_documentos WHERE chave_acesso = ?', [chaveTeste]);
});

test('TICKET 12 - API: POST /api/nfe emite NFS-e DPS e persiste registro', async () => {
  const req = {
    method: 'POST',
    url: '/api/nfe',
    body: {
      tipoNota: 'NFSE_SERVICO',
      cliente: {
        nome: 'CLIENTE SERVICO ARTESANAL',
        cpf: '22233344455'
      },
      servico: {
        valor: 250.00,
        discriminacao: 'Gravação a laser em bainha de faca'
      }
    }
  };
  const res = criarMockRes();

  await handlerNfe(req, res);

  assert.strictEqual(res.getStatusCode(), 201);
  const data = res.getData();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.tipoNota, 'NFSE_SERVICO');
  assert.strictEqual(data.status, 'AUTORIZADO');
  assert.strictEqual(data.valorTotal, 250.00);

  await db.run('DELETE FROM fiscal_documentos WHERE chave_acesso = ?', [data.chaveAcesso]);
});


test('TICKET 13 - UI: Botão de emissão fiscal integrado no modal de pedidos e menu de contexto', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');

  // 1. Botão no modal de pedidos
  assert.ok(html.includes('id="btn-ped-emitir-fiscal"'), 'Botão de emissão fiscal deve existir no modal de pedido');
  assert.ok(html.includes('onclick="abrirModalFiscalPorPedidoId(document.getElementById(\'form-ped-id\').value)"'), 'Deve chamar abrirModalFiscalPorPedidoId');
  assert.ok(html.includes('tabindex="-1" class="btn-top" id="btn-ped-emitir-fiscal"'), 'Botão deve ter tabindex="-1"');

  // 2. Menu de contexto de pedidos
  assert.ok(html.includes('abrirModalFiscalPorPedidoId(${p.id})'), 'Menu de contexto do pedido deve chamar abrirModalFiscalPorPedidoId');
});

test('TICKET 13 - UI: Validação visual preventiva de NCM (8 dígitos) e bloqueio de transmissão', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');

  // Validação preventiva e alerta
  assert.ok(html.includes('id="fiscal-alerta-ncm"'), 'Div de alerta visual de NCM deve existir no modal fiscal');
  assert.ok(html.includes('oninput="validarNcmCampoFiscal(this)"'), 'Campo NCM deve disparar validação no evento input');
  assert.ok(html.includes('function validarNcmCampoFiscal('), 'Função validarNcmCampoFiscal deve estar definida');
});

test('TICKET 13 - UI: JavaScript controller implementa pré-carregamento por pedidoId, chave 44 dígitos e DANFE', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');

  assert.ok(html.includes('function abrirModalFiscalPorPedidoId('), 'Função abrirModalFiscalPorPedidoId deve estar definida');
  assert.ok(html.includes('function baixarXmlFiscal()'), 'Função baixarXmlFiscal deve estar definida');
  assert.ok(html.includes('/api/nfe'), 'Deve chamar a API /api/nfe no controller de emissão');
});
