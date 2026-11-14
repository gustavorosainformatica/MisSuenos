import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.join(__dirname, '..', 'public', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf-8');

test('Validação do Filtro Dinâmico de Categorias no Cabeçalho de Estoque', async (t) => {
  await t.test('deve conter botão de filtro dedicado e container do dropdown no th de Categoria', () => {
    assert.match(indexHtml, /id="btn-filtro-cat-produtos"/,
      'Botão #btn-filtro-cat-produtos deve estar presente');
    assert.match(indexHtml, /id="dropdown-menu-categorias-produtos"/,
      'Container #dropdown-menu-categorias-produtos deve estar presente');
    assert.match(indexHtml, /aoClicarHeaderOrdenar\('tabela-produtos',\s*'categoria'\)/,
      'Ação de ordenação deve permanecer intacta');
  });

  await t.test('deve conter estilos CSS para o botão e dropdown flutuante moderno', () => {
    assert.match(indexHtml, /\.btn-th-filter-cat\s*\{[^}]*cursor:\s*pointer/s,
      'Estilo do botão de filtro deve estar definido com cursor pointer');
    assert.match(indexHtml, /\.btn-th-filter-cat\.ativo\s*\{/s,
      'Estilo de estado ativo para botão de filtro deve estar definido');
    assert.match(indexHtml, /\.cat-dropdown-menu\s*\{[^}]*position:\s*absolute/s,
      'Estilo do menu suspenso deve estar definido');
  });

  await t.test('deve conter as funções JS para abrir, fechar e selecionar categoria com contagem', () => {
    assert.match(indexHtml, /function toggleDropdownCategoriasProdutos/,
      'Função toggleDropdownCategoriasProdutos deve estar definida');
    assert.match(indexHtml, /function fecharDropdownCategoriasProdutos/,
      'Função fecharDropdownCategoriasProdutos deve estar definida');
    assert.match(indexHtml, /function selecionarCategoriaProdutosHeader/,
      'Função selecionarCategoriaProdutosHeader deve estar definida');
    assert.match(indexHtml, /function atualizarBotaoFiltroCategoriaHeader/,
      'Função atualizarBotaoFiltroCategoriaHeader deve estar definida');
  });
});
