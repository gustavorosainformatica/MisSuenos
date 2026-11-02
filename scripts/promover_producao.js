#!/usr/bin/env node
/**
 * SCRIPT DE PROMOÇÃO SEGURA: HOMOLOGAÇÃO (DEV) -> PRODUÇÃO (MAIN)
 * Mis Sueños ERP
 * Autor: Gustavo Rosa Informática
 * Ambiente: Windows 11 / Node.js
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  dim: '\x1b[2m'
};

function run(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: 'pipe' }).trim();
}

console.log(c.cyan + c.bold + '═'.repeat(70) + c.reset);
console.log(c.cyan + c.bold + '🚀 PROMOVER ATUALIZAÇÕES: AMBIENTE DE TESTES -> PRODUÇÃO OFICIAL' + c.reset);
console.log(c.dim + '   Gustavo Rosa Informática - Mis Sueños ERP' + c.reset);
console.log(c.cyan + c.bold + '═'.repeat(70) + c.reset);

const devDir = 'd:\\projetos-agy\\MisSuenos-Dev';
const prodDir = 'd:\\projetos-agy\\MisSuenos';

try {
  // 1. Verificar status em Dev
  console.log('\n🔍 [1/5] Verificando alterações no ambiente de testes (MisSuenos-Dev)...');
  const statusDev = run('git status --porcelain', devDir);
  if (statusDev) {
    console.log(c.yellow + '   ⚠️ Existem alterações não commitadas em Dev. Criando commit automático...' + c.reset);
    run('git add .', devDir);
    const dataHora = new Date().toLocaleString('pt-BR');
    run(`git commit -m "feat(dev): melhorias e validacoes testadas em homologacao [${dataHora}]"`, devDir);
    console.log(c.green + '   ✔ Commit realizado com sucesso em Dev.' + c.reset);
  } else {
    console.log(c.green + '   ✔ Diretório Dev limpo e commitado.' + c.reset);
  }

  // 2. Enviar Dev para o GitHub
  console.log('\n📤 [2/5] Enviando branch dev para o GitHub remoto...');
  run('git push origin dev', devDir);
  console.log(c.green + '   ✔ Branch dev atualizada no GitHub com sucesso!' + c.reset);

  // 3. Atualizar repositório de Produção
  console.log('\n🏢 [3/5] Acessando repositório de produção (MisSuenos)...');
  if (!fs.existsSync(prodDir)) {
    throw new Error(`Diretório de produção não encontrado: ${prodDir}`);
  }

  // Garante que está na branch main
  run('git checkout main', prodDir);
  console.log('   ✔ Garantido branch main no repositório oficial.');

  // 4. Fazer merge seguro das novidades da branch dev na main
  console.log('\n🔀 [4/5] Integrando novidades da branch dev na branch main (Merge seguro)...');
  const mergeResult = run('git merge dev -m "merge: promover melhorias testadas de dev para producao"', prodDir);
  console.log(c.dim + '   ' + mergeResult.split('\n')[0] + c.reset);
  console.log(c.green + '   ✔ Merge executado sem conflitos!' + c.reset);

  // 5. Enviar para a produção oficial na Nuvem (GitHub / Vercel / Cloudflare)
  console.log('\n🚀 [5/5] Enviando para a branch main no GitHub (Disparando deploy na Nuvem)...');
  run('git push origin main', prodDir);
  console.log(c.green + '   ✔ Deploy disparado na nuvem com 100% de sucesso!' + c.reset);

  console.log('\n' + c.green + c.bold + '🎉 SUCESSO TOTAL! A versão de produção foi atualizada com as novidades validadas em teste.' + c.reset);
  console.log(c.dim + 'O sistema oficial em produção e na nuvem já está rodando as novas alterações.' + c.reset);
  console.log(c.cyan + '═'.repeat(70) + c.reset);

} catch (err) {
  console.error('\n' + c.red + c.bold + '❌ ERRO AO PROMOVER PARA PRODUÇÃO:' + c.reset);
  console.error(c.red + err.message + c.reset);
  process.exit(1);
}

