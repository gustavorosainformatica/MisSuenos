# Plano de Execução em Tickets: Múltiplas Tabelas de Preço (Varejo vs. Atacado)

> **Status:** Pronto para Execução (/implement-spec)  
> **Referência:** [SPEC_TABELAS_PRECO_ERP.md](file:///C:/Users/Usuario/.gemini/antigravity/brain/88de6a06-2ad4-4b7b-beb9-d4846ded37b2/SPEC_TABELAS_PRECO_ERP.md)  
> **Data:** 15 de Novembro de 2026  

---

### Ticket 01: Migração de Schema do Banco de Dados & Camada de Persistência
- **Objetivo:** Criar e executar a migração idempotente no SQLite local e Turso Cloud para comportar preços de atacado e tabelas de preço, além de atualizar o `lib/db.js`.
- **Arquivos Envolvidos:**
  - `scripts/migrar_schema_tabelas_preco.js` (novo)
  - `lib/db.js` (atualização do DDL inicial)
- **Ações a Executar:**
  1. Desenvolver `scripts/migrar_schema_tabelas_preco.js` com inspeção de `PRAGMA table_info` antes de executar `ALTER TABLE`:
     - Em `produtos`: adicionar `preco_atacado REAL DEFAULT NULL` e `qtd_minima_atacado REAL DEFAULT 5.0`.
     - Em `clientes`: adicionar `tabela_preco TEXT DEFAULT 'VAREJO'`.
  2. Atualizar o script de DDL inicial em `lib/db.js` (`inicializarTabelas()`) para que novas instâncias já criem as tabelas com as novas colunas.
  3. Executar a migração no banco de desenvolvimento local.
- **Passo de Validação:**
  - `node scripts/migrar_schema_tabelas_preco.js` executando sem erros e validando que as 3 colunas existem via query SQL `PRAGMA table_info`.
- **Status:** [ ] Pendente

---

### Ticket 02: Endpoints da API REST de Produtos e Clientes
- **Objetivo:** Capacitar as rotas de API para receber, validar, sanitizar e persistir os campos de atacado e tabela de preços.
- **Arquivos Envolvidos:**
  - `api/produtos.js`
  - `api/clientes.js`
- **Ações a Executar:**
  1. Em `api/produtos.js`:
     - No `POST` e `PUT`: extrair `preco_atacado` (parse float seguro, nulo se não informado ou vazio) e `qtd_minima_atacado` (padrão 5 se omitido).
     - Incluir as colunas no `INSERT INTO produtos` e no `UPDATE produtos`.
     - No `GET`: retornar `preco_atacado` e `qtd_minima_atacado` no JSON de cada produto.
  2. Em `api/clientes.js`:
     - No `POST` e `PUT`: extrair `tabela_preco` (normalizado em maiúsculo: `'VAREJO'` ou `'ATACADO'`, fallback para `'VAREJO'`).
     - Incluir a coluna no `INSERT INTO clientes` e `UPDATE clientes`.
     - No `GET`: retornar `tabela_preco` no JSON do cliente.
- **Passo de Validação:**
  - Requisição de teste inserindo produto com atacado e cliente com tabela atacado, verificando retorno HTTP 201 e persistência fiel.
- **Status:** [ ] Pendente

---

### Ticket 03: Motor Híbrido de Resolução de Preços & Suíte de Testes TDD
- **Objetivo:** Implementar o motor de regras de negócio de precificação híbrida e criar a suíte de testes automatizados garantindo 100% de cobertura.
- **Arquivos Envolvidos:**
  - `public/calculos_erp.js` (ou módulo de regras)
  - `tests/tabelas_preco.test.js` (novo)
- **Ações a Executar:**
  1. Implementar a função universal `resolverPrecoItem({ produto, cliente, tabelaPedido, qtd })`:
     - Se `tabelaPedido === 'ATACADO'` OU `cliente?.tabela_preco === 'ATACADO'` OU `qtd >= (produto.qtd_minima_atacado || 5)`:
       - Se `produto.preco_atacado > 0`: retorna `preco_atacado`, `tabelaAplicada: 'ATACADO'`, `fallbackUsado: false`.
       - Se `preco_atacado` for nulo/zero: retorna `preco_venda`, `tabelaAplicada: 'ATACADO_FALLBACK'`, `fallbackUsado: true`.
     - Senão: retorna `preco_venda`, `tabelaAplicada: 'VAREJO'`, `fallbackUsado: false`.
  2. Criar suíte de testes `tests/tabelas_preco.test.js` cobrindo:
     - Cenário 1: Cliente de atacado recebe preço de atacado.
     - Cenário 2: Cliente de varejo atingindo quantidade mínima converte para atacado.
     - Cenário 3: Cliente de varejo com quantidade baixa mantém varejo.
     - Cenário 4: Alternância manual de tabela no pedido força a respectiva tabela.
     - Cenário 5: Produto sem preço de atacado faz fallback seguro para varejo sem travar nem zerar.
- **Passo de Validação:**
  - `node --test tests/tabelas_preco.test.js` executando e passando 100% dos testes.
- **Status:** [ ] Pendente

---

### Ticket 04: UI no Cadastro de Produtos e Clientes (Ergonomia & Formulários)
- **Objetivo:** Adicionar os campos nos modais de produtos e clientes com conformidade estrita aos padrões globais de UI/UX (Caixa Alta, Tab fluida, remoção de spinners).
- **Arquivos Envolvidos:**
  - `public/index.html`
- **Ações a Executar:**
  1. No Modal de Produto (`#modal-novo-produto`):
     - Inserir campo `Preço de Atacado (R$)` ao lado de Preço de Venda.
     - Inserir campo `Qtd. Mínima Atacado` com placeholder `5 (PADRÃO)`.
     - Garantir remoção de spinners nativos e ordem natural da tecla `Tab`.
     - Carregar os campos ao editar produto existente.
  2. No Modal de Cliente (`#modal-novo-cliente`):
     - Inserir seletor `Tabela de Preço Padrão`: `<select>` estilizado com opções `VAREJO (PADRÃO)` e `ATACADO`.
     - Carregar o valor ao editar cliente existente.
  3. No catálogo/tabela de produtos:
     - Adicionar indicação visual discreta de preço de atacado (ex: tooltip ou subtexto verde `Atacado: R$ X`).
- **Passo de Validação:**
  - Abrir os modais no navegador, cadastrar produto com atacado, editar cliente com perfil atacado e validar ergonomia de teclado.
- **Status:** [ ] Pendente

---

### Ticket 05: Checkout & Pedidos de Venda Reativos (Combobox & Gatilho de Quantidade)
- **Objetivo:** Integrar a resolução híbrida de preços no fluxo de criação e edição de pedidos de venda em tempo real.
- **Arquivos Envolvidos:**
  - `public/index.html`
  - `api/pedidos.js`
- **Ações a Executar:**
  1. No Modal de Pedido (`#modal-pedido`):
     - Adicionar na toolbar superior o seletor: `🏷️ TABELA DO PEDIDO: [ VAREJO ▼ / ATACADO ]`.
     - Ao selecionar um cliente no Combobox: atualizar o seletor da tabela para o perfil do cliente automaticamente.
     - Ao alterar manualmente o seletor da tabela: recalcular todos os itens da lista reativamente.
  2. No Combobox de Produtos do Pedido:
     - Exibir o preço ativo correspondente à tabela selecionada.
  3. Na Tabela de Itens do Pedido:
     - Ao alterar a quantidade do item: se atingir `qtd_minima_atacado`, converter o valor unitário para atacado e exibir badge `[ATACADO 5+ un]`.
     - Se o produto não tiver preço de atacado, exibir aviso sutil: `⚠️ Sem preço atacado (usando varejo)`.
  4. Em `api/pedidos.js`:
     - Gravar `tabela_preco_aplicada` no registro do pedido e persistir `tabela_item` em `itens_detalhados`.
- **Passo de Validação:**
  - Criar um pedido com 1 item em varejo, aumentar a quantidade para 5 e verificar a conversão automática para atacado; salvar e auditar persistência.
- **Status:** [ ] Pendente

---

### Ticket 06: Sincronização Tríplice, Validação de Não-Regressão e Deploy
- **Objetivo:** Sincronizar as melhorias entre os 3 ambientes (`MisSuenos`, `erp-base`, `MisSuenos-Dev`), rodar a suíte completa de testes e auditar o deploy na nuvem.
- **Arquivos Envolvidos:**
  - `d:/projetos-agy/clientes/MisSuenos/*`
  - `d:/projetos-agy/erp-base/*`
  - `D:/projetos-agy/sandbox/MisSuenos-Dev/*`
- **Ações a Executar:**
  1. Rodar `npm test` no `MisSuenos` (garantir 190+ testes passando).
  2. Replicar de forma neutra as migrações, endpoints, testes e UI para o `erp-base` e `MisSuenos-Dev`.
  3. Rodar `npm test` no `erp-base` e no `MisSuenos-Dev`.
  4. Executar `git push origin main` e auditar o build na Vercel até o status `Deployment has completed` (`HTTP 200 OK`).
- **Passo de Validação:**
  - Deploy auditado com sucesso na nuvem e requisição HTTP confirmando a versão ativa.
- **Status:** [ ] Pendente
