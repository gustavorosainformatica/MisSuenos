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
