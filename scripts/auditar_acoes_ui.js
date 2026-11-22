import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pastaPublica = path.join(raiz, 'public');
const arquivosHtml = [];

function listarHtml(pasta) {
  for (const entrada of fs.readdirSync(pasta, { withFileTypes: true })) {
    const caminho = path.join(pasta, entrada.name);
    if (entrada.isDirectory()) listarHtml(caminho);
    else if (entrada.isFile() && entrada.name.toLowerCase().endsWith('.html')) arquivosHtml.push(caminho);
  }
}

function obterAtributo(atributos, nome) {
  const seguro = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const encontrado = atributos.match(new RegExp(`(?:^|\\s)${seguro}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return encontrado ? (encontrado[1] ?? encontrado[2] ?? encontrado[3] ?? '') : null;
}

listarHtml(pastaPublica);

const duplicidades = [];
let acoesIdentificadas = 0;

for (const arquivo of arquivosHtml) {
  const html = fs.readFileSync(arquivo, 'utf8');
  const modulos = html.matchAll(/<main\b([^>]*)>([\s\S]*?)<\/main\s*>/gi);

  for (const modulo of modulos) {
    const idModulo = obterAtributo(modulo[1], 'id') || 'modulo-sem-id';
    const porAcao = new Map();

    for (const botao of modulo[2].matchAll(/<button\b([^>]*)>/gi)) {
      const acao = obterAtributo(botao[1], 'data-ui-action');
      if (!acao) continue;
      acoesIdentificadas += 1;

      const excecao = obterAtributo(botao[1], 'data-ui-duplicate-allowed');
      const ocorrencias = porAcao.get(acao) || [];
      ocorrencias.push({ excecao });
      porAcao.set(acao, ocorrencias);
    }

    for (const [acao, ocorrencias] of porAcao) {
      if (ocorrencias.length < 2) continue;
      if (ocorrencias.every(item => item.excecao?.trim())) continue;
      duplicidades.push({ arquivo, idModulo, acao, quantidade: ocorrencias.length });
    }
  }
}

if (duplicidades.length > 0) {
  console.error('Foram encontradas ações primárias duplicadas no mesmo módulo:');
  for (const item of duplicidades) {
    console.error(`- ${path.relative(raiz, item.arquivo)} :: ${item.idModulo} :: ${item.acao} (${item.quantidade} ocorrências)`);
  }
  console.error('Consolide os controles ou documente uma exceção justificada com data-ui-duplicate-allowed.');
  process.exitCode = 1;
} else {
  console.log(`Auditoria concluída: ${acoesIdentificadas} ações identificadas, sem duplicidades no mesmo módulo.`);
}
