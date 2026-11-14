import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.join(__dirname, '..', 'public', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf-8');

test('Validação do Split-Resizer Interativo no Modal de Etiqueta de Envio (#modal-etiqueta)', async (t) => {
  await t.test('deve conter o elemento HTML da divisória arrastável com ID e classes corretas', () => {
    assert.match(indexHtml, /<div[^>]*class="[^"]*etiqueta-split-resizer[^"]*"[^>]*id="etiqueta-split-resizer"/,
      'Divisória #etiqueta-split-resizer deve estar presente no HTML');
  });

  await t.test('deve conter regras CSS para o split-resizer com cursor col-resize e estilo moderno', () => {
    assert.match(indexHtml, /\.etiqueta-split-resizer\s*\{[^}]*cursor:\s*col-resize/s,
      'CSS da divisória deve definir cursor: col-resize');
    assert.match(indexHtml, /#modal-etiqueta \.etiqueta-split-resizer:hover::before/s,
      'CSS deve conter destaque neon suave no hover da divisória');
    assert.ok(
      indexHtml.includes('#modal-etiqueta .etiqueta-split-resizer') &&
      indexHtml.includes('@media print'),
      'CSS deve ocultar a divisória durante a impressão física da etiqueta'
    );
  });

  await t.test('deve conter as funções JavaScript para controle e persistência de largura no localStorage', () => {
    assert.match(indexHtml, /function inicializarSplitResizerEtiqueta\(\)/,
      'Função inicializarSplitResizerEtiqueta deve estar definida');
    assert.match(indexHtml, /function aplicarLarguraSalvaSplitEtiqueta\(\)/,
      'Função aplicarLarguraSalvaSplitEtiqueta deve estar definida');
    assert.match(indexHtml, /erp_split_width_etiqueta/,
      'Chave do localStorage deve ser erp_split_width_etiqueta');
    assert.match(indexHtml, /aplicarLarguraSalvaSplitEtiqueta\(\)/,
      'Deve chamar aplicarLarguraSalvaSplitEtiqueta ao abrir a etiqueta');
  });
});

test('Validação da Remoção de Dados Fictícios e Badges de Demonstração em Produção', async (t) => {
  await t.test('não deve conter menção a "11 de demonstração / teste" no badge de produtos', () => {
    assert.doesNotMatch(indexHtml, /\(11 de demonstração \/ teste\)/,
      'Badge de produtos não deve exibir texto de demonstração');
  });

  await t.test('não deve conter menção a "199 notas (🧪 DADOS FICTÍCIOS / TESTE)"', () => {
    assert.doesNotMatch(indexHtml, /199 notas \(🧪 DADOS FICTÍCIOS \/ TESTE\)/,
      'Badge fiscal não deve exibir dados fictícios');
  });

  await t.test('não deve conter badge de "🧪 TESTE / FICTÍCIO" na renderização fiscal', () => {
    assert.doesNotMatch(indexHtml, /🧪 TESTE \/ FICTÍCIO/,
      'Renderização de notas fiscais não deve estampar badges de teste');
  });

  await t.test('listaFiscal e listaFinanceiro devem iniciar vazias e carregar dados reais via API', () => {
    assert.match(indexHtml, /let listaFiscal\s*=\s*\[\s*\];/,
      'listaFiscal deve iniciar como array vazio');
    assert.match(indexHtml, /let listaFinanceiro\s*=\s*\[\s*\];/,
      'listaFinanceiro deve iniciar como array vazio');
    assert.match(indexHtml, /async function carregarFiscalApi\(\)/,
      'carregarFiscalApi deve estar implementada para buscar /api/nfe');
    assert.match(indexHtml, /async function carregarFinanceiroApi\(\)/,
      'carregarFinanceiroApi deve estar implementada para buscar /api/financeiro');
  });
});
