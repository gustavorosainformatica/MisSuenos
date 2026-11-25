// Controla o preenchimento assistido na ficha de clientes.
window.cadastroEmpresa = (() => {
  const campo = id => document.getElementById(id);
  const camposEndereco = ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'];
  const sugeridos = new Map();
  const empresaAtiva = () => campo('form-tipo-pessoa').value === 'PJ';
  const aviso = (mensagem, tipo = 'info') => {
    const el = campo('form-consulta-status');
    if (!el) return;
    el.textContent = mensagem;
    if (tipo === 'erro') {
      el.style.color = '#f87171';
    } else if (tipo === 'sucesso') {
      el.style.color = '#4ade80';
    } else if (tipo === 'aviso') {
      el.style.color = '#fbbf24';
    } else {
      el.style.color = '#94a3b8';
    }
  };
  const documento = () => campo('form-cnpj').value.replace(/[^0-9A-Za-z]/g, '');
  let pedidoAtual;
  let ultimoDocumento = '';
  let versaoEndereco = 0;
  let tipoAnterior;
  let nomesPorTipo;
  let dadosPendentes;

  function mascararCnpj(valor) {
    const limpo = String(valor || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    return limpo.slice(0, 12).concat(limpo.slice(12).replace(/\D/g, '').slice(0, 2))
      .replace(/^(.{2})(.)/, '$1.$2')
      .replace(/^(.{6})(.)/, '$1.$2')
      .replace(/^(.{10})(.)/, '$1/$2')
      .replace(/^(.{15})(.)/, '$1-$2');
  }

  function cancelar() {
    pedidoAtual?.abort();
    pedidoAtual = null;
    dadosPendentes = null;
    campo('form-aplicar-consulta').hidden = true;
    versaoEndereco++;
  }

  function retirarSugestoes() {
    for (const [id, valor] of sugeridos) {
      if (campo(id).value === valor) campo(id).value = '';
    }
    sugeridos.clear();
  }

  function exibirTipo(focar) {
    const empresa = empresaAtiva();
    const ficha = campo('form-cliente');
    ficha.querySelectorAll('[data-cliente-pj]').forEach(el => { el.hidden = !empresa; });
    ficha.querySelectorAll('[data-cliente-pf]').forEach(el => { el.hidden = empresa; });
    campo('form-nome-rotulo').textContent = empresa ? 'RAZÃO SOCIAL *' : 'NOME COMPLETO *';
    campo('form-nome').placeholder = empresa ? 'RAZÃO SOCIAL DA EMPRESA' : 'NOME COMPLETO';
    campo('form-apelido-rotulo').textContent = empresa ? 'NOME FANTASIA / REFERÊNCIA' : 'APELIDO / REFERÊNCIA';
    campo('form-apelido').placeholder = empresa ? 'NOME FANTASIA' : 'APELIDO OU REFERÊNCIA';
    if (focar) campo(empresa ? 'form-cnpj' : 'form-nome').focus();
  }

  function iniciar(cliente = {}) {
    cancelar();
    sugeridos.clear();
    aviso('');
    tipoAnterior = cliente.tipo_pessoa || (cliente.cnpj || cliente.razao_social ? 'PJ' : 'PF');
    campo('form-tipo-pessoa').value = tipoAnterior;
    nomesPorTipo = {
      PF: { nome: cliente.cpf || tipoAnterior === 'PF' ? cliente.nome || '' : '', apelido: '' },
      PJ: { nome: cliente.razao_social || '', apelido: '' }
    };
    campo('form-cnpj').value = mascararCnpj(cliente.cnpj);
    campo('form-cnpj').setCustomValidity('');
    ultimoDocumento = documento();
    if (empresaAtiva() && cliente.razao_social) campo('form-nome').value = cliente.razao_social;
    campo('form-nome-contato').value = cliente.nome_contato || '';
    let endereco = {};
    try { endereco = JSON.parse(cliente.endereco_cadastral || '{}') || {}; } catch { /* Ficha sem endereço estruturado. */ }
    for (const chave of camposEndereco) campo('fiscal-cli-' + chave).value = endereco[chave] || '';
    exibirTipo(false);
  }

  function trocarTipo() {
    cancelar();
    retirarSugestoes();
    nomesPorTipo[tipoAnterior] = { nome: campo('form-nome').value, apelido: campo('form-apelido').value };
    tipoAnterior = campo('form-tipo-pessoa').value;
    campo('form-nome').value = nomesPorTipo[tipoAnterior].nome;
    campo('form-apelido').value = nomesPorTipo[tipoAnterior].apelido;
    aviso('');
    campo('form-cnpj').setCustomValidity('');
    exibirTipo(true);
    if (empresaAtiva() && validarCnpjAlgoritmo(documento())) consultar();
  }

  function teclarCnpj(evento) {
    if (evento.ctrlKey || evento.metaKey || evento.altKey || evento.key.length !== 1) return;
    const el = campo('form-cnpj');
    const posicao = el.value.slice(0, el.selectionStart).replace(/[.\/-]/g, '').length;
    const permitido = posicao < 12 ? /^[0-9a-z]$/i : /^\d$/;
    if (!permitido.test(evento.key)) evento.preventDefault();
  }

  function digitarCnpj() {
    const el = campo('form-cnpj');
    const formatado = mascararCnpj(el.value);
    if (el.value !== formatado) el.value = formatado;
    const atual = documento();
    if (atual === ultimoDocumento) return;
    cancelar();
    retirarSugestoes();
    ultimoDocumento = atual;
    el.setCustomValidity('');
    aviso('');
    if (atual.length === 14) consultar();
  }

  function sugerir(id, valor) {
    if (!valor || campo(id).value.trim()) return;
    campo(id).value = valor;
    sugeridos.set(id, valor);
  }

  function aplicarConsulta() {
    if (!empresaAtiva() || !dadosPendentes) return;
    const entregaVazio = camposEndereco.every(chave => !campo('form-' + chave)?.value?.trim());
    for (const [id, valor] of Object.entries(dadosPendentes)) {
      if (campo(id)) {
        campo(id).value = valor;
        sugeridos.set(id, valor);
      }
      if (entregaVazio && id.startsWith('fiscal-cli-')) {
        const idEntrega = id.replace('fiscal-cli-', 'form-');
        if (campo(idEntrega)) {
          campo(idEntrega).value = valor;
          sugeridos.set(idEntrega, valor);
        }
      }
    }
    dadosPendentes = null;
    campo('form-aplicar-consulta').hidden = true;
    aviso('Dados cadastrais e de entrega aplicados. Confira antes de salvar.', 'sucesso');
  }

  async function consultar() {
    const cnpj = documento();
    if (!empresaAtiva()) return;
    if (pedidoAtual) {
      pedidoAtual.abort();
      pedidoAtual = null;
    }
    if (!validarCnpjAlgoritmo(cnpj)) {
      aviso('Confira o CNPJ informado. Dígitos verificadores incorretos.', 'erro');
      campo('form-cnpj').focus();
      return;
    }
    const pedido = new AbortController();
    pedidoAtual = pedido;
    dadosPendentes = null;
    campo('form-aplicar-consulta').hidden = true;
    aviso('🔍 Consultando CNPJ nos servidores da Receita...', 'info');
    try {
      const parametros = new URLSearchParams({ acao: 'consultar_cnpj', cnpj });
      const resposta = await fetch('/api/clientes?' + parametros, { signal: pedido.signal });
      const dados = await resposta.json();
      if (pedido.signal.aborted) return;
      if (!resposta.ok || !dados.razao_social) {
        aviso(dados.error || 'Consulta indisponível. Preencha os campos manualmente.', 'erro');
        return;
      }
      sugerir('form-nome', dados.razao_social);
      sugerir('form-apelido', dados.nome_fantasia);
      if (/^\d{10,11}$/.test(dados.telefone) && checarTelefoneValido(dados.telefone).valido) {
        sugerir('form-telefone', aplicarMascaraTelefoneValor(dados.telefone));
      }
      if (dados.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) sugerir('form-email', dados.email);
      const comparacao = { 'form-nome': dados.razao_social };
      if (dados.nome_fantasia) comparacao['form-apelido'] = dados.nome_fantasia;
      // Preenche tanto o endereço cadastral quanto o de entrega (se vazios)
      const cadastralVazio = camposEndereco.every(chave => !campo('fiscal-cli-' + chave)?.value?.trim());
      const entregaVazio = camposEndereco.every(chave => !campo('form-' + chave)?.value?.trim());

      if (camposEndereco.some(chave => dados.endereco?.[chave])) {
        for (const chave of camposEndereco) {
          const idCadastral = 'fiscal-cli-' + chave;
          const idEntrega = 'form-' + chave;
          const bruto = dados.endereco[chave] || '';
          const valor = chave === 'cep' ? aplicarMascaraCepValor(bruto) : bruto;
          comparacao[idCadastral] = valor;
          if (cadastralVazio) sugerir(idCadastral, valor);
          if (entregaVazio) sugerir(idEntrega, valor);
        }
      }
      if (Object.entries(comparacao).some(([id, valor]) => campo(id).value !== valor)) {
        dadosPendentes = comparacao;
        campo('form-aplicar-consulta').hidden = false;
        aviso('Os dados da consulta diferem da ficha. Você pode manter a ficha ou usar os dados consultados.', 'aviso');
        return;
      }
      aviso('✅ Consulta concluída. Dados preenchidos com sucesso.', 'sucesso');
    } catch {
      if (!pedido.signal.aborted) aviso('Consulta indisponível. Tente novamente ou preencha manualmente.', 'erro');
    } finally {
      if (pedidoAtual === pedido) pedidoAtual = null;
    }
  }

  async function consultarIe() {
    const cnpj = documento();
    if (!empresaAtiva()) return;
    if (!cnpj || cnpj.length < 14 || !validarCnpjAlgoritmo(cnpj)) {
      aviso('Informe um CNPJ válido para consultar a Inscrição Estadual.', 'aviso');
      campo('form-cnpj').focus();
      return;
    }

    const uf = campo('fiscal-cli-uf')?.value || campo('form-uf')?.value || 'RS';
    aviso('🔍 Consultando Inscrição Estadual na SEFAZ...', 'info');

    try {
      const parametros = new URLSearchParams({ acao: 'consultar_ie', cnpj, uf });
      const resposta = await fetch('/api/clientes?' + parametros);
      const dados = await resposta.json();

      // Opção 1: Backend com Certificado A1 ativo retornou a IE com sucesso
      if (resposta.ok && dados.sucesso && dados.ie) {
        campo('form-ie').value = dados.ie;
        aviso('✅ Inscrição Estadual encontrada na SEFAZ: ' + dados.ie, 'sucesso');
        if (typeof mostrarToast === 'function') mostrarToast('IE ' + dados.ie + ' aplicada com sucesso!');
        campo('form-ie').focus();
        return;
      }

      // Opção 2: Certificado A1 ainda não configurado (status 412) ou transição para CCC
      // Copia o CNPJ para a área de transferência e abre o portal oficial do CCC
      const cnpjFormatado = campo('form-cnpj').value || cnpj;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(cnpjFormatado);
        }
      } catch {
        // Fallback se permissão de clipboard estiver bloqueada pelo navegador
      }

      const linkCcc = dados.link_ccc || 'https://dfe-portal.svrs.rs.gov.br/Nfe/Ccc';
      window.open(linkCcc, '_blank', 'noopener,noreferrer');

      aviso('📋 CNPJ copiado! Cole na página do CCC aberta para consultar a IE (ou use [ISENTO]).', 'aviso');
      if (typeof mostrarToast === 'function') {
        mostrarToast('CNPJ copiado! Cole no CCC para conferir a Inscrição Estadual.');
      }
    } catch {
      // Fallback de conexão: abre o CCC diretamente
      const cnpjFormatado = campo('form-cnpj').value || cnpj;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(cnpjFormatado);
        }
      } catch {}
      window.open('https://dfe-portal.svrs.rs.gov.br/Nfe/Ccc', '_blank', 'noopener,noreferrer');
      aviso('📋 CNPJ copiado! Abrindo CCC da SEFAZ...', 'aviso');
    }
  }

  function marcarIsento() {
    campo('form-ie').value = 'ISENTO';
    aviso('Inscrição Estadual definida como ISENTO.', 'sucesso');
    if (typeof mostrarToast === 'function') mostrarToast('Inscrição Estadual marcada como ISENTO');
  }

  function usarNaEntrega() {
    if (!empresaAtiva() || !camposEndereco.some(chave => campo('fiscal-cli-' + chave).value.trim())) {
      aviso('Informe o endereço cadastral para usá-lo na entrega.');
      return;
    }
    versaoEndereco++;
    for (const chave of camposEndereco) campo('form-' + chave).value = campo('fiscal-cli-' + chave).value;
    aviso('Endereço copiado. Confira os campos de entrega.');
    campo('form-numero').focus();
  }

  function marcarIsento() {
    const el = campo('form-ie');
    if (!el) return;
    el.value = 'ISENTO';
    aviso('Inscrição Estadual definida como ISENTO (Não Contribuinte).', 'sucesso');
    if (typeof mostrarToast === 'function') mostrarToast('Inscrição Estadual marcada como ISENTO.');
  }

  function abrirReceita() {
    const cnpj = documento();
    const cnpjFormatado = campo('form-cnpj')?.value.trim();
    if (cnpj && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cnpjFormatado || cnpj).catch(() => {});
      if (typeof mostrarToast === 'function') {
        mostrarToast('📋 CNPJ copiado! Cole na página da Receita Federal.');
      }
    }
  }

  async function consultarIe() {
    const cnpj = documento();
    if (!empresaAtiva()) return;
    if (!validarCnpjAlgoritmo(cnpj)) {
      aviso('Informe um CNPJ válido para consultar a Inscrição Estadual.', 'erro');
      campo('form-cnpj').focus();
      return;
    }

    const uf = (campo('fiscal-cli-uf')?.value || campo('form-uf')?.value || 'RS').trim().toUpperCase();
    const cnpjFormatado = campo('form-cnpj').value.trim();

    aviso('🔍 Consultando Inscrição Estadual na SEFAZ...', 'info');

    try {
      const parametros = new URLSearchParams({ acao: 'consultar_ie', cnpj, uf });
      const resposta = await fetch('/api/clientes?' + parametros);
      const dados = await resposta.json().catch(() => ({}));

      // Caso o backend com Certificado A1 retorne a IE com sucesso (Opção 1)
      if (resposta.ok && dados.sucesso && dados.ie) {
        campo('form-ie').value = dados.ie;
        aviso(`✅ Inscrição Estadual encontrada na SEFAZ: ${dados.ie} (${dados.situacao || 'HABILITADO'})`, 'sucesso');
        if (typeof mostrarToast === 'function') mostrarToast(`IE ${dados.ie} preenchida via SEFAZ!`);
        campo('form-ie').focus();
        return;
      }

      // Caso o Certificado A1 ainda não esteja ativo no banco (Opção 2 - Transição fluida para CCC / Sintegra)
      let copiado = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(cnpjFormatado || cnpj);
          copiado = true;
        }
      } catch {}

      const linkCcc = dados.link_ccc || 'https://dfe-portal.svrs.rs.gov.br/Nfe/Ccc';
      window.open(linkCcc, '_blank', 'noopener,noreferrer');

      const msgCopiado = copiado ? '📋 CNPJ copiado! ' : '';
      aviso(`${msgCopiado}Portal CCC aberto em nova aba. Cole o CNPJ para conferir a IE ou clique em [ISENTO].`, 'aviso');
      if (typeof mostrarToast === 'function') {
        mostrarToast(`${msgCopiado}Abrindo Cadastro Centralizado (CCC/SEFAZ)...`);
      }
    } catch {
      window.open('https://dfe-portal.svrs.rs.gov.br/Nfe/Ccc', '_blank', 'noopener,noreferrer');
      aviso('Portal CCC aberto em nova aba. Cole o CNPJ para conferir a IE ou marque [ISENTO].', 'aviso');
    }
  }

  function dadosParaSalvar(cliente) {
    const empresa = empresaAtiva();
    const cpf = campo('form-doc').value.trim();
    const cnpj = campo('form-cnpj').value.trim();
    if (empresa && cnpj && !validarCnpjAlgoritmo(cnpj)) {
      campo('form-cnpj').setCustomValidity('Confira o CNPJ informado.');
      campo('form-cnpj').reportValidity();
      return null;
    }
    if (!empresa && cpf && (cpf.replace(/\D/g, '').length !== 11 || !validarCpfAlgoritmo(cpf))) {
      mostrarToast('CPF inválido. Confira os 11 dígitos.');
      campo('form-doc').focus();
      return null;
    }
    const endereco = {};
    for (const chave of camposEndereco) endereco[chave] = campo('fiscal-cli-' + chave).value.trim().toUpperCase();
    if (empresa && endereco.cep && !checarCepValido(endereco.cep).valido) {
      mostrarToast('Informe os oito dígitos do CEP cadastral.');
      campo('fiscal-cli-cep').focus();
      return null;
    }
    const nome = campo('form-nome').value.trim().toUpperCase();
    // Alguns cadastros antigos têm um nome de exibição diferente da razão social.
    const nomeDistinto = cliente?.nome && cliente.razao_social && cliente.nome !== cliente.razao_social;
    return {
      tipo_pessoa: empresa ? 'PJ' : 'PF',
      nome: empresa && nomeDistinto ? cliente.nome : nome,
      razao_social: empresa ? nome : cliente?.razao_social || '',
      cpf: empresa ? cliente?.cpf || '' : cpf,
      cnpj: empresa ? cnpj : cliente?.cnpj || '',
      nome_contato: empresa ? campo('form-nome-contato').value.trim().toUpperCase() : cliente?.nome_contato || '',
      endereco_cadastral: empresa ? JSON.stringify(endereco) : cliente?.endereco_cadastral || ''
    };
  }

  return { iniciar, trocarTipo, teclarCnpj, digitarCnpj, consultar, consultarIe, marcarIsento, abrirReceita, aplicarConsulta, usarNaEntrega, dadosParaSalvar, cancelar,
    get versaoEndereco() { return versaoEndereco; }
  };
})();
