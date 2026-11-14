import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.join(__dirname, '..', 'public', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf-8');

test('Validação do Filtro Dinâmico de Categorias no Topo do Estoque (Padrão Pedidos de Venda)', async (t) => {
  await t.test('deve conter o elemento select com seta id="filtro-categoria-produtos-topo" na toolbar', () => {
    assert.match(indexHtml, /<select[^>]*id="filtro-categoria-produtos-topo"[^>]*onchange="filtrarProdutosPorCategoria\(this\.value\)"/,
      'Elemento select de categorias deve estar presente na barra superior da tabela');
  });

  await t.test('cabeçalho de Categoria deve estar limpo sem botão "Filtrar" mantendo ordenação e grip', () => {
    assert.doesNotMatch(indexHtml, /id="btn-filtro-cat-produtos"/,
      'Não deve conter o botão "Filtrar" antigo no cabeçalho');
    assert.match(indexHtml, /<th[^>]*data-col="categoria"[^>]*onclick="aoClicarHeaderOrdenar\('tabela-produtos',\s*'categoria'\)"[^>]*>Categoria\s*<span[^>]*id="sort-produtos-categoria"><\/span><span[^>]*class="th-grip-icon">⠿<\/span><\/th>/,
      'Cabeçalho de Categoria deve ser limpo e suportar ordenação normalmente');
  });

  await t.test('deve conter as funções JS para popular categorias e estilizar o select', () => {
    assert.match(indexHtml, /function atualizarSelectCategoriasTopo\(\)/,
      'Função atualizarSelectCategoriasTopo deve estar definida');
    assert.match(indexHtml, /function atualizarEstiloFiltroCategoriaTopo\(cat\)/,
      'Função atualizarEstiloFiltroCategoriaTopo deve estar definida');
    assert.match(indexHtml, /atualizarEstiloFiltroCategoriaTopo\(cat\);/,
      'filtrarProdutosPorCategoria deve sincronizar o estilo do select do topo');
  });
});
