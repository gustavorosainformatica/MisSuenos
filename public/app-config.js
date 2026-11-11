/**
 * CONFIGURAÇÃO DINÂMICA DE IDENTIDADE VISUAL - PRODUÇÃO & HOMOLOGAÇÃO
 * Mis Sueños ERP (Blindado por Governança Zero-PII)
 * Autor: Gustavo Rosa Informática
 *
 * Nota de Segurança (Zero-PII):
 * Dados sensíveis de endereço, telefone privado, documento fiscal e nome pessoal do proprietário
 * NÃO ficam hardcoded neste arquivo; são carregados dinamicamente da API (/api/configuracoes) no banco de dados.
 */

(function () {
  const isBrowser = typeof window !== 'undefined' && window.location;
  const port = isBrowser ? String(window.location.port || '') : '';
  const hostname = isBrowser ? String(window.location.hostname || '').toLowerCase() : '';
  const search = isBrowser ? String(window.location.search || '').toLowerCase() : '';

  const isDev = (
    port === '3002' ||
    search.includes('env=dev') ||
    hostname.includes('-dev') ||
    hostname.includes('homolog')
  );

  const configProd = {
    appName: "Mis Sueños ERP | Gestão Integrada de Couros, Clientes & Fiscal",
    shortName: "",
    tagline: "",
    companyName: "Mis Sueños Couros & Peles",
    companyRazaoSocial: "MIS SUEÑOS COUROS & PELES",
    userName: "Administrador",
    userRole: "Gestão & Operação",
    userInitials: "MS",
    logoEmoji: "🪵",
    logoImage: "logo.png",
    stockModuleName: "Estoque de Couros",
    breadcrumbName: "Mis Sueños ERP",
    dataNoticeIcon: "",
    dataNoticeTitle: "",
    dataNoticeText: "",
    dataNoticeBadge: "",
    companyAddress: "",
    companyCityState: "",
    companyCep: "",
    companyPhone: "",
    isTemplateBase: false,
    isDevEnvironment: false
  };

  const configDev = {
    ...configProd,
    appName: "Mis Sueños ERP [TESTES]",
    shortName: "TESTES",
    companyName: "Mis Sueños (TESTES)",
    companyRazaoSocial: "MIS SUEÑOS (AMBIENTE DE HOMOLOGAÇÃO)",
    userName: "Operador (Testes)",
    userRole: "Homologação",
    userInitials: "DEV",
    logoEmoji: "🧪",
    stockModuleName: "Estoque de Couros (Dev)",
    breadcrumbName: "Mis Sueños [DEV]",
    dataNoticeIcon: "🧪",
    dataNoticeTitle: "BASE DE DADOS ISOLADA PARA TESTES",
    dataNoticeText: "Ambiente isolado de testes e homologação. Novas funções, pedidos e clientes criados aqui NÃO afetam a base oficial.",
    dataNoticeBadge: "🧪 AMBIENTE DE TESTES",
    isDevEnvironment: true
  };

  window.APP_CONFIG = isDev ? configDev : configProd;
})();
