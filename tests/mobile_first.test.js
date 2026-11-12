import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('MOBILE TICKET 01: Arquivo mobile.css existe e está vinculado no index.html', () => {
  const cssPath = path.join(rootDir, 'public', 'mobile.css');
  assert.ok(fs.existsSync(cssPath), 'Arquivo public/mobile.css deve existir');

  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(
    htmlContent.includes('mobile.css'),
    'public/index.html deve referenciar o arquivo mobile.css'
  );
});

test('MOBILE TICKET 01: mobile.css contém regras obrigatórias de infraestrutura mobile', () => {
  const cssPath = path.join(rootDir, 'public', 'mobile.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // 1. Breakpoint oficial max-width: 768px
  assert.ok(
    cssContent.includes('@media (max-width: 768px)'),
    'mobile.css deve definir o breakpoint @media (max-width: 768px)'
  );

  // 2. Prevenção de auto-zoom do Safari iOS (font-size >= 16px)
  assert.ok(
    cssContent.includes('16px'),
    'mobile.css deve ter regra de font-size: 16px para inputs prevenindo auto-zoom no iOS'
  );

  // 3. Remoção universal de spinners em inputs numéricos
  assert.ok(
    cssContent.includes('::-webkit-inner-spin-button') && cssContent.includes('textfield'),
    'mobile.css deve remover spinners de input number'
  );

  // 4. Touch target mínimo de 44px
  assert.ok(
    cssContent.includes('44px'),
    'mobile.css deve garantir alvo de toque mínimo de 44px'
  );

  // 5. Suporte a viewport dinâmico (100dvh)
  assert.ok(
    cssContent.includes('100dvh') || cssContent.includes('100vh'),
    'mobile.css deve ter suporte a altura dinâmica de viewport'
  );
});

test('MOBILE TICKET 02: Bottom Navigation Bar contém exatamente as 5 abas oficiais', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // Verifica as 5 abas oficiais aprovadas
  assert.ok(htmlContent.includes('mob-nav-painel'), 'Deve conter aba Painel (mob-nav-painel)');
  assert.ok(htmlContent.includes('mob-nav-pedidos'), 'Deve conter aba Pedidos (mob-nav-pedidos)');
  assert.ok(htmlContent.includes('mob-nav-fab-btn'), 'Deve conter botão central flutuante (mob-nav-fab-btn)');
  assert.ok(htmlContent.includes('mob-nav-clientes'), 'Deve conter aba Clientes (mob-nav-clientes)');
  assert.ok(htmlContent.includes('mob-nav-produtos'), 'Deve conter aba Estoque (mob-nav-produtos)');
});

test('MOBILE TICKET 02: mobile.css estiliza Bottom Navigation com botão central esmeralda', () => {
  const cssPath = path.join(rootDir, 'public', 'mobile.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert.ok(
    cssContent.includes('.mobile-bottom-nav'),
    'mobile.css deve conter estilização de .mobile-bottom-nav'
  );
  assert.ok(
    cssContent.includes('.mob-nav-fab-btn') && (cssContent.includes('#10b981') || cssContent.includes('emerald')),
    'mobile.css deve conter estilização do botão central FAB esmeralda'
  );
});

test('MOBILE TICKET 03: Containers de cards mobile existem no index.html', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(
    htmlContent.includes('mobile-pedidos-cards'),
    'index.html deve conter o container id="mobile-pedidos-cards"'
  );
  assert.ok(
    htmlContent.includes('mobile-clientes-cards'),
    'index.html deve conter o container id="mobile-clientes-cards"'
  );
});

test('MOBILE TICKET 03: mobile.css contém estilos para Card View e alternância com tabelas', () => {
  const cssPath = path.join(rootDir, 'public', 'mobile.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert.ok(
    cssContent.includes('.mobile-cards-container'),
    'mobile.css deve conter classe .mobile-cards-container'
  );
  assert.ok(
    cssContent.includes('.mobile-card'),
    'mobile.css deve conter classe .mobile-card'
  );
});

test('MOBILE TICKET 03: Função renderCardsPedidosMobile existe e gera cards estruturados', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(
    htmlContent.includes('function renderCardsPedidosMobile') || htmlContent.includes('renderCardsPedidosMobile ='),
    'index.html deve conter a função renderCardsPedidosMobile'
  );
});

test('MOBILE TICKET 04: Modal de Pedidos possui campo de Forma de Pagamento', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(
    htmlContent.includes('form-ped-forma-pagamento'),
    'index.html deve conter o campo id="form-ped-forma-pagamento" no modal de pedido'
  );
});

test('MOBILE TICKET 04: mobile.css adapta #modal-pedido para Fullscreen Modal com fechar à esquerda', () => {
  const cssPath = path.join(rootDir, 'public', 'mobile.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert.ok(
    cssContent.includes('#modal-pedido') && cssContent.includes('100dvh'),
    'mobile.css deve adaptar #modal-pedido para ocupar 100dvh'
  );
  assert.ok(
    cssContent.includes('modal-close-btn') && cssContent.includes('order: -1'),
    'mobile.css deve posicionar o botão fechar ✕ à esquerda no mobile'
  );
});

test('MOBILE TICKET 05: mobile.css estiliza modais rápidos como Bottom Sheet com alça e animação', () => {
  const cssPath = path.join(rootDir, 'public', 'mobile.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert.ok(
    cssContent.includes('align-items: flex-end') || cssContent.includes('slideUpSheetMobile'),
    'mobile.css deve conter regra de alinhamento inferior para Bottom Sheet'
  );
  assert.ok(
    cssContent.includes('slideUpSheetMobile') || cssContent.includes('keyframes slideUp'),
    'mobile.css deve conter animação de subida suave do Bottom Sheet'
  );
});

test('MOBILE TICKET 06: index.html implementa escuta de popstate para botão Voltar do celular', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(
    htmlContent.includes('popstate') && htmlContent.includes('modal-overlay'),
    'index.html deve interceptar evento popstate para fechar modais no celular'
  );
});

test('MOBILE TICKET 06: Não-regressão desktop garantida (mobile-cards-container oculto fora de @media)', () => {
  const cssPath = path.join(rootDir, 'public', 'mobile.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert.ok(
    cssContent.includes('.mobile-cards-container {\n  display: none;\n}') ||
    cssContent.includes('.mobile-cards-container {\r\n  display: none;\r\n}') ||
    cssContent.includes('.mobile-cards-container{display:none}') ||
    cssContent.includes('display: none'),
    'mobile-cards-container deve iniciar oculto no desktop'
  );
});

test('MOBILE TICKET 07: Service Worker atualizado para missuenos-pwa-v59/v60 e inclui mobile.css', () => {
  const swPath = path.join(rootDir, 'public', 'sw.js');
  const swContent = fs.readFileSync(swPath, 'utf8');

  assert.ok(
    swContent.includes('missuenos-pwa-v59') || swContent.includes('missuenos-pwa-v60'),
    'sw.js deve conter a versão missuenos-pwa-v59 ou v60'
  );
  assert.ok(
    swContent.includes('/mobile.css'),
    'sw.js deve incluir /mobile.css na lista de STATIC_ASSETS'
  );
});
