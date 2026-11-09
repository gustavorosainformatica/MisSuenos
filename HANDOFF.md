# HANDOFF & RESUMO TÉCNICO - SESSÃO MIS SUEÑOS ERP

> **Data de Atualização:** 09 de Novembro de 2026 — 15:20 (BRT)  
> **Status Geral:** Dropdown Pesquisável de Produtos (Combobox com Busca em Tempo Real) + Ergonomia de Teclado + Tríplice Sincronizada (39 Testes TDD 100% Passando)  
> **Domínio de Produção:** [https://missuenos.vercel.app](https://missuenos.vercel.app)

---

## 0. Menu Dropdown Pesquisável de Produtos (Solicitação Gustavo)
- **Problema & Necessidade:** Em "Itens e Mercadorias do Pedido", o operador desejava utilizar exclusivamente o menu dropdown de catálogo, porém com o campo sendo editável para permitir pesquisa rápida pelo nome do produto.
- **Solução Implementada (Combobox Dropdown Integrado):**
  1. **Visual Único & Fluido:** Eliminada a alternância entre modos e botões redundantes. O campo agora é um Dropdown Combobox com botão `▼` dedicado.
  2. **Busca e Filtro em Tempo Real:** Ao focar, clicar no campo ou na setinha `▼`, o menu abre exibindo todos os produtos do catálogo (com SKU, nome em destaque, preço e estoque disponível). Ao digitar qualquer parte do nome ou SKU, a lista é filtrada instantaneamente sem acentuação (`normalizarTextoBusca`).
  3. **Navegação Completa por Teclado:** Suporta `ArrowDown`, `ArrowUp` e `Enter` para selecionar, preenchendo automaticamente o preço unitário e focando na quantidade.
  4. **Fallback para Itens Avulsos:** Caso o operador digite um produto que não exista no catálogo, o dropdown disponibiliza a opção de adicionar como Item Avulso / Personalizado.

---

## 0.1 Ergonomia de Teclado no Pedido & Remoção de Setas Redundantes (Solicitação Gustavo)
- **Problema Relatado:**
  1. A quantidade apresentava setas verticais nativas redundantes no input numérico (`spinners`), poluindo a interface.
  2. Ao utilizar a tecla `Tab`, o cursor parava em botões de ação e controle (como botões `−`, `+` e lixeira `🗑️`), em vez de fluir exclusivamente pelos campos digitáveis.
  3. O cursor não iniciava automaticamente dentro do campo "Cliente / Destinatário" ao abrir o modal de pedidos.
- **Soluções Implementadas:**
  1. **Remoção Universal de Spinners Numéricos:** Regra CSS global (`input[type=number]::-webkit-inner-spin-button`, `-moz-appearance: textfield`) eliminando setas redundantes de todos os inputs numéricos do ERP.
  2. **Fluxo Contínuo de Tabulação (`tabindex="-1"`):** Atribuído `tabindex="-1"` a botões de controle de quantidade (`−` e `+`), exclusão de linhas (`🗑️`), botões de visualização/alternância (`Modo Texto Livre`, `Menu Dropdown`, `Observações`, `Preferências`, `Espelho A4`, `Romaneio`, `Cancelar`, `✕`) e campos readonly de totais (`form-ped-valor`). A navegação por `Tab` agora salta estritamente entre os campos digitáveis.
  3. **Foco e Seleção Automática no Cliente:** Implementado `setTimeout` com `focus()` e `select()` em `form-ped-cliente-nome` tanto no cadastro de novo pedido quanto na edição, posicionando o operador pronto para digitar ou substituir o cliente imediatamente.

---

## 0.1 Correção de Colisão de Número de Pedido (UNIQUE Constraint)
- **Problema Relatado:** Ao salvar novo pedido, o sistema apresentava `Erro ao salvar pedido: Erro interno ao processar pedido: UNIQUE constraint failed: pedidos.numero`.
- **Causa Raiz Identificada:** O cálculo do próximo número no frontend (`abrirModalNovoPedido`) realizava `Math.max` em cima de `p.id` (que possui auto-incremento pequeno 1 a 9) com fallback 1042, gerando sempre `#PED-1043`, que já existia no banco para outro cliente.
- **Solução Implementada com Dupla Blindagem:**
  1. **Frontend & Biblioteca Central (`lib/calculos_erp.js`):** Nova função `calcularProximoNumeroPedido(pedidos)` que extrai os dígitos reais de `p.numero` via regex `/\d+/`, garantindo que se existir `#PED-1043` na base, a próxima sugestão seja `#PED-1044` (ou superior).
  2. **Backend Serverless (`api/pedidos.js`):** Blindagem preventiva no endpoint POST. Se o número não for informado ou se já existir no banco de dados, o backend consulta os números existentes e auto-incrementa para o próximo disponível, eliminando a colisão `UNIQUE constraint failed`.
  3. **Feedback Visual Fiel (`salvarPedido`):** O toast de confirmação consome o número final retornado pelo backend (`resultado.numero || payload.numero`).
  4. **Suíte de Testes:** Novo teste `REGRESSÃO PEDIDOS 10` adicionado com 39 testes unitários passando com 100% de sucesso.

---

## 1. Diretriz Oficial de Design: Padronização Minimalista e Limpa (Zero Parênteses Óbvios)
- **Princípio Aprovado pelo Usuário Gustavo:** Eliminar solenemente parênteses e textos didáticos redundantes (como `(+ AUMENTAR)`, `(- BAIXAR)`, `(CONTAGEM)`, `(A)` ou `(B)`).
- **Segmented Controls Compactos:** Utilizar barras seletoras segmentadas elegantes com termos consolidados (`🟢 Entrada`, `🔴 Saída`, `⚖️ Balanço`, `Todos`).
- **Rótulos Inteligentes de Contexto:** Em vez de poluir os botões com texto longo, os campos subsequentes ajustam seu título dinamicamente.
- **Tipografia & Proporções:** *JetBrains Mono* para códigos, documentos, quantidades e valores monetários.

---

## 2. Relatório de Compras do Cliente no Menu de Contexto (Opção A com Atalho Interno para Opção B)
- **Disparo no Botão Direito (`abrirMenuAcoesCliente`):**
  - Adicionado o item `🛍️ Relatório de Compras (X)` exibindo dinamicamente a contagem real de compras do cliente na base.
- **Modal Flutuante de Extrato Comercial & CRM (`#modal-relatorio-compras-cliente`):**
  - **Cards de Indicadores (KPIs):** Faturamento Total Comprado (R$), Ticket Médio, Total de Pedidos e Data da Última Compra.
  - **Grade de Pedidos:** Listagem cronológica dos pedidos com número, data, status estilizado, itens adquiridos, frete, total e botão para abrir o Espelho A4 do pedido individual.
  - **Ação A (Impressão A4 de Extrato):** Botão `[ 🖨️ Imprimir Extrato A4 ]` configurado com CSS `@media print` dedicado, gerando documento comercial limpo para conferência.
  - **Ação B (Atalho Interno):** Botão `[ 📦 Ver na Grade de Pedidos ]` que fecha o modal, salta diretamente para o módulo de pedidos e aplica o filtro de busca pelo nome do cliente instantaneamente.

---

## 3. Universalização de Caixa Alta e Blindagem de Dados em Todas as Telas
Em estrita conformidade com as Regras Globais do Antigravity homologadas pelo usuário Gustavo:
- **Caixa Alta Universal (CSS + Interceptor Global + Backend):**
  - Estilização universal em `.form-input, input[type="text"], input[type="search"], input[type="email"], textarea, select` com `text-transform: uppercase !important`.
  - Interceptor global nativo de eventos `input` com captura antecipada (`capture: true`), convertendo a digitação para maiúsculas em tempo real sem perder a posição do cursor.
  - Sanitização estrita com `.toUpperCase().trim()` em todas as funções de envio (`salvarPedido`, `salvarCliente`, `salvarProduto`, `salvarLancamentoFinanceiro`, `salvarDadosEmpresa`, `salvarNovoCodigoRastreio`, `confirmarAjusteEstoque`, etc.).
- **Foco Inteligente de CEP (Cidades com CEP Único vs Cidades com Logradouro Mapeado):**
  - Se a cidade possui ruas mapeadas na base dos Correios: preenche o logradouro e foca diretamente no campo "Número".
  - Se o município tiver CEP único (rua vazia nos Correios, ex: Osório/RS `95520-000`): posiciona o foco diretamente no campo "Logradouro / Rua" com aviso sutil ao operador, impedindo que o campo seja deixado em branco.
- **Blindagem e Máscara Autoajustável de Telefone no Pedido e Configurações:**
  - Aplicada a máscara progressiva `(00) 0000-0000` / `(00) 00000-0000` também no formulário de Novo Pedido (`form-ped-telefone`) e nos dados da empresa emitente (`cfg-telefone-emitente`).
  - Bloqueio físico de letras no `keydown` e validação estrita de integridade com DDD nacional antes de salvar.
- **Validação Matemática Estrita (Módulo 11 da Receita Federal):**
  - Impedimento total de gravação caso o CPF ou CNPJ esteja matematicamente inválido quando preenchido.

---

## 2. Nova Funcionalidade Implementada: Espelho do Pedido A4 & Romaneio de Expedição
Implementada a especificação [`SPEC-espelho-pedido-romaneio-pdf.md`](file:///d:/projetos-agy/MisSuenos/docs/specs/SPEC-espelho-pedido-romaneio-pdf.md) e executados os 6 tickets de [`TICKETS-espelho-pedido-romaneio-pdf.md`](file:///d:/projetos-agy/MisSuenos/docs/tickets/TICKETS-espelho-pedido-romaneio-pdf.md):

1. **Modal de Pré-Visualização Unificado (`#modal-imprimir-documento-pedido`):**
   - Modal em formato imersivo com simulação da folha A4 proporcional (210mm x 297mm).
   - Abas rápidas para alternar entre **📄 Espelho Comercial A4** e **📦 Romaneio de Galpão**.
   - Barra de ações completa: `[ 🖨️ Imprimir / Salvar PDF ]`, `[ 💬 WhatsApp ]`, `[ 📋 Copiar Resumo ]` e `[ ✕ Fechar ]`.
2. **Espelho do Pedido Comercial (Folha A4 / PDF):**
   - Cabeçalho corporativo com logotipo e dados fiscais completos (CNPJ, IE, WhatsApp, E-mail, Endereço).
   - Identificação do pedido com número destacado, vendedor, data e situação.
   - Dados do destinatário e informações de entrega / frete.
   - Tabela tabulada de itens com SKU, quantidade, unitário e subtotal.
   - Totalizadores com Subtotal de Produtos, Frete Unificado e Total Geral em destaque.
   - Instruções de pagamento PIX (chave, favorecido, banco) e observações especiais do pedido.
   - CSS `@media print` calibrado para folha A4 vertical (sem margens sujas do navegador).
3. **Romaneio de Expedição de Galpão (Checklist Operacional):**
   - Título e cabeçalho para conferência física de depósito.
   - Destinatário, modalidade de envio (Superfrete, Sedex, Jadlog) e código de rastreio.
   - Tabela com caixas de conferência `[  ]`, quantidade em fonte grande (`1x`, `2x`), SKU e localização no estoque.
   - Quadro de embalagem, peso estimado e volumes.
   - Campo formal de rubrica/assinatura do estoquista conferente.
4. **Disparos Operacionais e Atalhos na UI:**
   - Botões `[ 📄 Espelho A4 ]` e `[ 📦 Romaneio ]` adicionados diretamente no rodapé da Ficha do Pedido (`modal-pedido`).
   - Atalhos inseridos no menu de contexto (botão direito) da tabela de pedidos.
   - Botão WhatsApp com link direto `https://wa.me/55...` com texto comercial pré-formatado.
   - Botão de cópia para a área de transferência com toast informativo.

---

## 3. Padronização em Caixa Alta e Blindagem Estrita de Dados (CPF/CNPJ, CEP e Telefone)
Aprovada e homologada pelo usuário Gustavo como regra global permanente:
- **Caixa Alta Universal (Uppercase):** Todos os inputs e textareas cadastrais e retornos de CEP operam e salvam em letras maiúsculas.
- **Bloqueio Físico de Letras em CPF/CNPJ:** Interceptação no `keydown` impedindo digitação de caracteres não numéricos.
- **Máscara Progressiva CPF/CNPJ:** Transição dinâmica de CPF (`000.000.000-00`) para CNPJ (`00.000.000/0000-00`).
- **Validação Matemática Estrita (Módulo 11 da Receita Federal):** Rejeição impeditiva de documentos com dígitos verificadores inválidos ou repetidos.
- **Blindagem e Autocompletação de CEP:** Limite de 8 números, máscara `00000-000`, busca automática no 8º dígito e foco inteligente direto no campo "Número".
- **Blindagem e Máscara Autoajustável de Telefone:** Formatação fluida entre fixo `(00) 0000-0000` (10 dígitos) e celular `(00) 00000-0000` (11 dígitos), validação de DDD e acionamento integrado de WhatsApp.

---

## 5. Suíte de Testes Automatizados TDD (/tdd) - 38 de 38 Testes Passando
A suíte agora conta com 4 arquivos de testes rodando pelo *Node.js Test Runner* nativo (`npm test`):
- `tests/calculos.test.js`: 8 testes cobrindo cálculos matemáticos, estoques e margens.
- `tests/pedidos.test.js`: 9 testes cobrindo variações de pedidos, itens múltiplos, frete e serialização round-trip.
- `tests/documentos.test.js`: 8 testes cobrindo resumo comercial, histórico de compras por cliente, ticket médio e formatação de moeda.
- `tests/validacoes.test.js`: 13 testes cobrindo CPF, CNPJ, Módulo 11, Caixa Alta, CEP e Telefone/Celular.

**Resultado Consolidado:** **38 de 38 testes passando com 100% de sucesso em ~450ms**.

---

## 5. Estado Atual e Sincronização Tríplice

- **Deploy em Produção Auditado e Operacional:**
  - URL Oficial: **[https://missuenos.vercel.app](https://missuenos.vercel.app)**
  - Service Worker: `missuenos-pwa-v56` ativo.
- **Paridade Tríplice Sincronizada:**
  - Repositório de Produção (`MisSuenos` - commit `5261990` na branch `main`).
  - Repositório de Desenvolvimento (`MisSuenos-Dev` - commit `b71beeb` na branch `dev`).
  - Matriz Molde Neutra (`erp-base` - commit `dba33c8` na branch `main`).
