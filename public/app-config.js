/**
 * CONFIGURAÇÃO DINÂMICA DE IDENTIDADE VISUAL - PRODUÇÃO & HOMOLOGAÇÃO
 * Mis Sueños ERP
 * Autor: Gustavo Rosa Informática
 * 
 * Funcionalidade:
 * - Detecta automaticamente se o ambiente é de TESTES/HOMOLOGAÇÃO ou PRODUÇÃO OFICIAL.
 * - Testes: Porta 3002, URLs com ?env=dev ou hostnames de homologação/dev.
 * - Produção: Domínio oficial (missuenos.vercel.app), porta 3000 ou acesso direto sem flags.
 * - Imune a sobreposições de merge do Git entre as branches.
 */

(function () {
  const isBrowser = typeof window !== 'undefined' && window.location;
  const port = isBrowser ? String(window.location.port || '') : '';
  const hostname = isBrowser ? String(window.location.hostname || '').toLowerCase() : '';
  const search = isBrowser ? String(window.location.search || '').toLowerCase() : '';

  // Regra de detecção do ambiente de Testes / Homologação:
  // 1. Porta local 3002 (padrão do servidor local MisSuenos-Dev)
  // 2. Parâmetro explícito na URL ?env=dev
  // 3. Subdomínio ou hostname contendo -dev ou homolog (ex: preview Vercel de dev)
  const isDev = (
    port === '3002' ||
    search.includes('env=dev') ||
    hostname.includes('-dev') ||
    hostname.includes('homolog')
  );

  const configProd = {
    appName: "Mis Sueños ERP | Gestão Integrada de Couros, Clientes & Fiscal",
    shortName: "Mis Sueños",
    tagline: "ERP Selaria & Couros",
    companyName: "Mis Sueños Couros & Peles",
    companyRazaoSocial: "MIS SUEÑOS COUROS & PELES",
    userName: "Marcos Machado",
    userRole: "Mis Sueños Couros & Peles",
    userInitials: "MM",
    logoEmoji: "🪵",
    logoImage: "logo.png",
    stockModuleName: "Estoque de Couros",
    breadcrumbName: "Mis Sueños ERP",
    dataNoticeIcon: "",
    dataNoticeTitle: "",
    dataNoticeText: "",
    dataNoticeBadge: "",
    companyAddress: "Rua Major João Villa Verde, nº 46 - Bairro Pitangueiras",
    companyCityState: "SANTO ANTÔNIO DA PATRULHA - RS",
    companyCep: "95500-000",
    companyPhone: "(51) 99719-9204",
    isTemplateBase: false,
    isDevEnvironment: false
  };

  const configDev = {
    appName: "Mis Sueños ERP [AMBIENTE DE TESTES] | Homologação & Validação",
    shortName: "Mis Sueños (TESTES)",
    tagline: "🧪 Ambiente de Desenvolvimento & Testes (Porta 3002)",
    companyName: "Mis Sueños Couros & Peles (TESTES)",
    companyRazaoSocial: "MIS SUEÑOS COUROS & PELES (AMBIENTE DE HOMOLOGAÇÃO)",
    userName: "Marcos Machado (Testes)",
    userRole: "Operador de Homologação",
    userInitials: "DEV",
    logoEmoji: "🧪",
    logoImage: "logo.png",
    stockModuleName: "Estoque de Couros (Dev)",
    breadcrumbName: "Mis Sueños [DEV]",
    dataNoticeIcon: "🧪",
    dataNoticeTitle: "BASE DE DADOS ISOLADA PARA TESTES",
    dataNoticeText: "Ambiente isolado de testes e homologação. Novas funções, pedidos e clientes criados aqui NÃO afetam a base oficial do cliente.",
    dataNoticeBadge: "🧪 AMBIENTE DE TESTES",
    companyAddress: "Rua Major João Villa Verde, nº 46 - Bairro Pitangueiras",
    companyCityState: "SANTO ANTÔNIO DA PATRULHA - RS",
    companyCep: "95500-000",
    companyPhone: "(51) 99719-9204",
    isTemplateBase: false,
    isDevEnvironment: true
  };

  window.APP_CONFIG = isDev ? configDev : configProd;
})();
