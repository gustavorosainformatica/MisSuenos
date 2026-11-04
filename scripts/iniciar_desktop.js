#!/usr/bin/env node
/**
 * INICIALIZADOR SILENCIOSO DESKTOP - MIS SUEÑOS ERP
 * Autor: Gustavo Rosa Informática
 * 
 * Abre o sistema em Modo Aplicativo Nativo (sem barra de URL).
 * Utiliza perfil de dados dedicado para manter processo isolado.
 * Suporta MÚLTIPLAS INSTÂNCIAS/JANELAS CONCORRENTES:
 * Se o ERP já estiver aberto, NÃO encerra o servidor; apenas abre
 * uma nova janela independente do aplicativo.
 * Zero janelas pretas de terminal abertas.
 */

import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.join(__dirname, '..');

// Descobre a porta configurada no projeto
let PORT = process.env.PORT;
if (!PORT) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'package.json'), 'utf-8'));
    if (pkg.port) PORT = pkg.port;
  } catch {}
}
if (!PORT) {
  try {
    const envContent = fs.readFileSync(path.join(BASE_DIR, '.env'), 'utf-8');
    const m = envContent.match(/PORT\s*=\s*(\d+)/);
    if (m) PORT = parseInt(m[1], 10);
  } catch {}
}
PORT = PORT || 3000;

// Localiza o executável do navegador (Chrome ou Edge)
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
let browserPath = null;

if (fs.existsSync(chromePath)) {
  browserPath = chromePath;
} else if (fs.existsSync(edgePath)) {
  browserPath = edgePath;
}

// Diretório de dados de perfil isolado para garantir processo independente
const pastaPerfil = path.join(
  process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Usuario', 'AppData', 'Local'),
  'ERP_Apps_Profiles',
  path.basename(BASE_DIR)
);

if (!fs.existsSync(pastaPerfil)) {
  fs.mkdirSync(pastaPerfil, { recursive: true });
}

const browserArgs = [
  `--app=http://localhost:${PORT}`,
  `--user-data-dir=${pastaPerfil}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-http-cache'
];

// Função para testar se o servidor já está ativo e respondendo
function testarServidorAtivo() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${PORT}/app-config.js`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(600, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// ====================================================================
// CASO 1: O ERP JÁ ESTÁ ABERTO (SEGUNDA JANELA / INSTÂNCIA)
// ====================================================================
const servidorJaAtivo = await testarServidorAtivo();

if (servidorJaAtivo) {
  // NÃO encerra o processo Node nem mata o servidor!
  // Apenas abre uma nova janela nativa independente do aplicativo
  if (browserPath) {
    const novaJanela = spawn(browserPath, browserArgs, {
      detached: true,
      stdio: 'ignore'
    });
    novaJanela.unref();
  } else {
    execSync(`start http://localhost:${PORT}`, { shell: 'cmd.exe' });
  }
  process.exit(0);
}

// ====================================================================
// CASO 2: PRIMEIRA INICIALIZAÇÃO (INICIA O SERVIDOR WEB)
// ====================================================================
// 1. Libera a porta caso um processo zumbi travado do Node tenha ficado para trás
try {
  const netstatOut = execSync('netstat -aon', { encoding: 'utf-8' });
  for (const line of netstatOut.split('\n')) {
    if (line.includes(`:${PORT} `) && line.includes('LISTENING')) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== String(process.pid)) {
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch {}
      }
    }
  }
} catch {}

// 2. Inicia o servidor web em segundo plano totalmente oculto
const serverProcess = spawn('node', ['scripts/servidor_web.js'], {
  cwd: BASE_DIR,
  stdio: 'ignore',
  windowsHide: true,
  env: { ...process.env, PORT: String(PORT) }
});

function encerrarTudo() {
  try { serverProcess.kill(); } catch {}
  process.exit(0);
}

serverProcess.on('exit', () => process.exit(0));
process.on('exit', encerrarTudo);
process.on('SIGINT', encerrarTudo);
process.on('SIGTERM', encerrarTudo);

// 3. Aguarda o servidor responder na porta
function aguardarServidor(tentativas = 30) {
  return new Promise((resolve) => {
    let count = 0;
    const interval = setInterval(() => {
      count++;
      const req = http.get(`http://localhost:${PORT}/app-config.js`, (res) => {
        clearInterval(interval);
        resolve();
      });
      req.on('error', () => {
        if (count >= tentativas) {
          clearInterval(interval);
          resolve();
        }
      });
    }, 150);
  });
}

await aguardarServidor();

// 4. Abre a janela do aplicativo nativo e monitora encerramento
if (browserPath) {
  const appWindow = spawn(browserPath, browserArgs, {
    detached: false,
    windowsHide: false
  });

  // Quando todas as janelas do aplicativo forem fechadas, encerra o servidor
  appWindow.on('exit', () => {
    encerrarTudo();
  });
} else {
  execSync(`start http://localhost:${PORT}`, { shell: 'cmd.exe' });
}
