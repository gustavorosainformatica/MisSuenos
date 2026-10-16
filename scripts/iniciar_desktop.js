#!/usr/bin/env node
/**
 * INICIALIZADOR SILENCIOSO DESKTOP - MIS SUEÑOS ERP
 * Autor: Gustavo Rosa Informática
 * 
 * Abre o sistema em Modo Aplicativo Nativo (sem barra de URL).
 * Utiliza perfil de dados dedicado para manter processo isolado.
 * Quando a janela do aplicativo é fechada pelo usuário (clique no 'X'),
 * encerra automaticamente o servidor em segundo plano.
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

// 1. Libera a porta caso um processo antigo do Node tenha ficado travado
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

// 4. Localiza o navegador para abrir em Modo Aplicativo
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
let browserPath = null;

if (fs.existsSync(chromePath)) {
  browserPath = chromePath;
} else if (fs.existsSync(edgePath)) {
  browserPath = edgePath;
}

if (browserPath) {
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
    '--no-default-browser-check'
  ];

  // Abre o navegador em Modo App isolado e monitora fechamento da janela
  const appWindow = spawn(browserPath, browserArgs, {
    detached: false,
    windowsHide: false
  });

  // Quando o usuário fecha a janela do aplicativo (clica no 'X'), encerra o servidor!
  appWindow.on('exit', () => {
    encerrarTudo();
  });
} else {
  execSync(`start http://localhost:${PORT}`, { shell: 'cmd.exe' });
}
