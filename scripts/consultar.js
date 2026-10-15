#!/usr/bin/env node
/**
 * CLI de Consulta Rápida de Clientes - Mis Sueños
 * Autor: Gustavo Rosa Informática
 * Uso:
 *   node scripts/consultar.js <termo_de_busca>
 *   npm run consultar -- "porto alegre"
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_JSON_PATH = path.join(__dirname, '..', 'database', 'clientes.json');

// Cores ANSI para terminal
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgBlue: '\x1b[44m'
};

if (!fs.existsSync(DB_JSON_PATH)) {
  console.error(`${c.yellow}[!] Arquivo de dados não encontrado em:${c.reset} ${DB_JSON_PATH}`);
  console.log(`Execute primeiro: ${c.cyan}npm run converter${c.reset}`);
  process.exit(1);
}

const clientes = JSON.parse(fs.readFileSync(DB_JSON_PATH, 'utf-8'));
const query = process.argv.slice(2).join(' ').trim();

if (!query) {
  console.log(`${c.bold}${c.cyan}======================================================================${c.reset}`);
  console.log(`  ${c.bold}SISTEMA DE CONSULTA DE CLIENTES - MIS SUEÑOS${c.reset}`);
  console.log(`${c.bold}${c.cyan}======================================================================${c.reset}`);
  console.log(`  ${c.bold}Total de clientes cadastrados:${c.reset} ${c.green}${clientes.length}${c.reset}`);
  
  // Resumo por UF
  const porUf = {};
  for (const cli of clientes) {
    const uf = cli.uf || 'OUTROS';
    porUf[uf] = (porUf[uf] || 0) + 1;
  }
  const ufsOrdenadas = Object.entries(porUf).sort((a, b) => b[1] - a[1]);
  console.log(`\n  ${c.bold}Distribuição por Estado (UF):${c.reset}`);
  const colunas = ufsOrdenadas.map(([uf, qtd]) => `${c.yellow}${uf}${c.reset}: ${qtd}`).join('  |  ');
  console.log(`  ${colunas}`);
  
  console.log(`\n  ${c.bold}Como pesquisar:${c.reset}`);
  console.log(`    node scripts/consultar.js <nome, cidade, cep, cpf ou cnpj>`);
  console.log(`    ${c.gray}Exemplo:${c.reset} ${c.cyan}node scripts/consultar.js "porto alegre"${c.reset}`);
  console.log(`    ${c.gray}Exemplo:${c.reset} ${c.cyan}node scripts/consultar.js "marcos"${c.reset}`);
  console.log(`    ${c.gray}Exemplo:${c.reset} ${c.cyan}node scripts/consultar.js "84300"${c.reset}`);
  console.log(`${c.bold}${c.cyan}======================================================================${c.reset}`);
  process.exit(0);
}

const qLimpa = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const qDigitos = query.replace(/\D/g, '');

const resultados = clientes.filter(cli => {
  const camposTexto = [
    cli.nome,
    cli.apelido_referencia,
    cli.razao_social,
    cli.logradouro,
    cli.bairro,
    cli.cidade,
    cli.uf,
    cli.arquivo_origem
  ].filter(Boolean).join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (camposTexto.includes(qLimpa)) return true;

  if (qDigitos.length >= 3) {
    if (cli.cpf_limpo && cli.cpf_limpo.includes(qDigitos)) return true;
    if (cli.cnpj_limpo && cli.cnpj_limpo.includes(qDigitos)) return true;
    if (cli.cep_limpo && cli.cep_limpo.includes(qDigitos)) return true;
    if (cli.telefone_limpo && cli.telefone_limpo.includes(qDigitos)) return true;
  }
  return false;
});

console.log(`${c.bold}${c.cyan}======================================================================${c.reset}`);
console.log(`  Busca por: ${c.yellow}"${query}"${c.reset} | Encontrados: ${c.green}${resultados.length}${c.reset} clientes`);
console.log(`${c.bold}${c.cyan}======================================================================${c.reset}\n`);

resultados.slice(0, 15).forEach((cli, i) => {
  console.log(`${c.bold}${c.cyan}[#${i + 1}] ${cli.nome}${c.reset}${cli.apelido_referencia ? ` ${c.magenta}(${cli.apelido_referencia})${c.reset}` : ''}`);
  
  if (cli.razao_social) {
    console.log(`     ${c.dim}Razão Social:${c.reset} ${cli.razao_social}`);
  }
  if (cli.cpf) {
    console.log(`     ${c.dim}CPF:${c.reset} ${c.green}${cli.cpf}${c.reset}`);
  }
  if (cli.cnpj) {
    console.log(`     ${c.dim}CNPJ:${c.reset} ${c.green}${cli.cnpj}${c.reset}${cli.ie ? ` | ${c.dim}IE:${c.reset} ${cli.ie}` : ''}`);
  }
  if (cli.telefone) {
    console.log(`     ${c.dim}Telefone:${c.reset} ${c.yellow}${cli.telefone}${c.reset}`);
  }
  
  const enderecoPartes = [
    cli.logradouro,
    cli.numero ? `nº ${cli.numero}` : '',
    cli.complemento ? `(${cli.complemento})` : ''
  ].filter(Boolean).join(' ');

  console.log(`     ${c.dim}Endereço:${c.reset} ${enderecoPartes || cli.endereco_completo || 'Não informado'}`);
  console.log(`     ${c.dim}Bairro:${c.reset}   ${cli.bairro || 'Não informado'}`);
  console.log(`     ${c.dim}Cidade/UF:${c.reset} ${c.bold}${cli.cidade || 'Não informada'} - ${cli.uf || 'UF'}${c.reset}  |  ${c.dim}CEP:${c.reset} ${c.cyan}${cli.cep || 'S/N'}${c.reset}`);
  console.log(`     ${c.gray}Arquivo:${c.reset}  ${cli.arquivo_origem}`);
  console.log(`${c.gray}----------------------------------------------------------------------${c.reset}`);
});

if (resultados.length > 15) {
  console.log(`${c.yellow}[!] Mostrando os primeiros 15 de ${resultados.length} resultados.${c.reset} Refine sua busca se necessário.`);
}
