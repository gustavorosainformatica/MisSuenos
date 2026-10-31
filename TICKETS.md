# Plano de Execução em Tickets: Conclusão Mis Sueños ERP & Template `erp-base`

**Especificação de Referência:** [SPEC.md](file:///d:/projetos-agy/MisSuenos/SPEC.md)  
**Data:** 30/10/2026  
**Autor:** Gustavo Rosa Informática  

---

### Ticket 1: Evolução do Schema de Banco de Dados (SQLite Local & Turso Cloud)
- **Objetivo:** Atualizar a camada de banco de dados para suportar NCM, Estoque Reservado, Fornecedores, Lançamentos Financeiros, Compras via XML e Configurações White-Label.
- **Arquivos Envolvidos:**
  - `lib/db.js`
  - `scripts/migrar_schema_v2.js` (novo script de migração segura)
- **Ações a Executar:**
  1. Atualizar `inicializarTabelas()` em `lib/db.js` incluindo as novas tabelas (`fornecedores`, `financeiro_lancamentos`, `compras_xml`, `configuracoes_sistema`).
  2. Criar e executar `scripts/migrar_schema_v2.js` que adiciona de forma idempotente as colunas `ncm` e `estoque_reservado` na tabela `produtos` e cria as novas tabelas tanto no SQLite local quanto no Turso Cloud (via Infisical).
- **Passo de Validação:**
  - Executar `node scripts/migrar_schema_v2.js` e `infisical run --silent -- node scripts/migrar_schema_v2.js`, verificando nos logs a presença de todas as tabelas e colunas sem erros.
- **Status:** [x] Concluído e Validado (SQLite Local + Turso Cloud)

---

### Ticket 2: Importação Oficial dos Códigos NCM e Catálogo da Planilha Excel
- **Objetivo:** Sincronizar os códigos NCM e produtos oficiais da planilha `NCM-NF/NCM - LISTA PARA NF.xlsx` diretamente na tabela `produtos` (local e nuvem).
- **Arquivos Envolvidos:**
  - `NCM-NF/NCM - LISTA PARA NF.xlsx`
  - `scripts/importar_ncm.py` ou `scripts/importar_ncm.js`
- **Ações a Executar:**
  1. Extrair todos os itens, códigos SKU, descrições, códigos NCM (8 dígitos, ex: `41131090`, `41012000`) e unidades de medida da planilha Excel.
  2. Atualizar os produtos existentes e inserir os itens faltantes da planilha tanto no SQLite local quanto no Turso Cloud.
- **Passo de Validação:**
  - Consultar a tabela `produtos` via CLI e confirmar que 100% dos itens possuem a coluna `ncm` preenchida com 8 dígitos válidos.
- **Status:** [x] Concluído e Validado (SQLite Local + Turso Cloud)

---

### Ticket 3: Controle de Estoque com Reserva Inteligente (Físico, Reservado e Disponível)
- **Objetivo:** Sinalizar produtos com venda em andamento assim que o pedido é criado e controlar os 3 saldos de estoque (Físico, Reservado e Disponível).
- **Arquivos Envolvidos:**
  - `api/produtos.js`
  - `api/pedidos.js`
  - `public/index.html`
- **Ações a Executar:**
  1. Atualizar `api/produtos.js` para ler/gravar `ncm` e `estoque_reservado`, retornando o campo calculado `estoque_disponivel`.
  2. Atualizar `api/pedidos.js`:
     - Na criação de pedido (`POST`): somar a quantidade dos itens em `estoque_reservado`;
     - Na mudança de status para `ENVIADO` ou `ENTREGUE` (`PUT`): descontar do `estoque_atual` (físico) e liberar de `estoque_reservado`;
     - No cancelamento ou exclusão (`DELETE`): liberar a quantidade de `estoque_reservado`.
  3. Atualizar a tela de Estoque e o modal de Produtos em `public/index.html` para exibir o campo **NCM**, o saldo **Disponível** e o badge amarelo *"⏳ X em pedido aberto"* quando houver reserva ativa.
- **Passo de Validação:**
  - Criar um pedido de teste, verificar se o produto exibe a reserva pendente, mudar para enviado e confirmar a baixa no estoque físico.
- **Status:** [x] Concluído e Validado (SQLite Local + Turso Cloud)

---

### Ticket 4: Módulo Financeiro (Contas a Receber Automático & Contas a Pagar Avulso)
- **Objetivo:** Implementar o controle completo de Contas a Pagar, Contas a Receber (com geração automática a partir dos pedidos) e Dashboard de Fluxo de Caixa.
- **Arquivos Envolvidos:**
  - `api/financeiro.js` (novo)
  - `api/pedidos.js`
  - `scripts/servidor_web.js`
  - `vercel.json`
  - `public/index.html`
- **Ações a Executar:**
  1. Criar `api/financeiro.js` com suporte a listagem filtrada (`RECEBER`/`PAGAR`, status, período), criação de lançamentos avulsos, baixa rápida de pagamento (`status = 'PAGO'`) e exclusão.
  2. Integrar `api/pedidos.js` para gerar automaticamente o lançamento em `financeiro_lancamentos` (`tipo = 'RECEBER'`, `origem = 'PEDIDO'`) ao fechar um pedido.
  3. Adicionar o item **"Financeiro & Caixa"** no menu lateral do `public/index.html` com cards de KPIs (A Receber, A Pagar, Saldo Previsto, Atrasados), tabela de títulos e modal de lançamento avulso.
- **Passo de Validação:**
  - Fechar um pedido e verificar o surgimento imediato da Conta a Receber; lançar uma despesa avulsa de Contas a Pagar e efetuar a baixa para validar o saldo do caixa.
- **Status:** [x] Concluído e Validado (SQLite Local + Turso Cloud)

---

### Ticket 5: Módulo de Compras, Fornecedores e Importação Híbrida de XML (Opções A e B)
- **Objetivo:** Permitir cadastro de fornecedores e importação de arquivo `.xml` de NF-e de compra com escolha por item entre (A) apenas despesa financeira ou (B) vínculo com produto para somar estoque e atualizar custo.
- **Arquivos Envolvidos:**
  - `api/compras.js` (novo)
  - `scripts/servidor_web.js`
  - `vercel.json`
  - `public/index.html`
- **Ações a Executar:**
  1. Criar `api/compras.js` contendo o parser de XML de NF-e (`<infNFe>`, `<emit>`, `<cobr><dup>`, `<det><prod>`), validação de idempotência por `chave_nfe` (44 dígitos) e gravação transacional.
  2. Implementar na interface (dentro de Financeiro/Estoque) o botão **"📥 Importar XML de Compra"** que abre o modal de revisão da nota:
     - Mostra dados do Fornecedor e parcelas que irão para o Contas a Pagar;
     - Lista os itens do XML permitindo alternar cada item entre **Opção (A) Ignorar Estoque (Despesa/Insumo)** ou **Opção (B) Vincular a Produto do Catálogo (Somar Estoque + Atualizar Custo)**.
- **Passo de Validação:**
  - Simular o upload de um XML de NF-e, testar a Opção A e a Opção B, verificar o cadastro automático do fornecedor, as parcelas no Contas a Pagar e a trava contra reimportação duplicada.
- **Status:** [x] Concluído e Validado (SQLite Local + Turso Cloud)

---

### Ticket 6: Gestão Visual de Usuários (RBAC) & Motor White-Label em Duas Camadas (`erp-base`)
- **Objetivo:** Disponibilizar na aba Configurações o gerenciamento visual de usuários/senhas/permissões e a parametrização White-Label por Ramo de Atividade (via Script Inicial + Painel Web).
- **Arquivos Envolvidos:**
  - `api/configuracoes.js` (novo)
  - `scripts/configurar_ramo.js` (novo assistente CLI de inicialização do template)
  - `public/app-config.js`
  - `public/index.html`
  - `package.json`
- **Ações a Executar:**
  1. Criar `api/configuracoes.js` para salvar e carregar configurações dinâmicas na tabela `configuracoes_sistema`.
  2. Criar `scripts/configurar_ramo.js` (comando `npm run configurar-ramo`) com presets prontos para **Selaria & Couros**, **Informática & Assistência**, **Comércio Geral** e **Oficina/Autopeças**.
  3. Atualizar a aba **Configurações** em `public/index.html` adicionando:
     - **Seção 1 — Equipe, Senhas e Permissões (RBAC):** Tabela de usuários com botão para criar operador, trocar senha personalizada e checkboxes de permissões (`fiscal_emitir`, `produtos_custo`, `clientes_excluir`, etc.);
     - **Seção 2 — Personalização White-Label & Dados Fiscais:** Edição de nome do ERP, ramo, categorias, CNPJ, IE e endereço do emitente.
- **Passo de Validação:**
  - Criar um usuário pela tela de Configurações, customizar suas permissões e testar o login; alterar uma configuração White-Label e verificar a atualização imediata na interface.
- **Status:** [x] Concluído e Validado (SQLite Local + Turso Cloud)

---

### Ticket 7: Conector Fiscal REST WLG Sistemas & Deploy Consolidado em Produção
- **Objetivo:** Integrar o módulo de emissão de NF-e (Modelo 55) ao cliente REST da WLG Sistemas (`fiscal.wlgsistemas.com.br/api/v1`), atualizar a documentação do template `erp-base` e publicar na Vercel.
- **Arquivos Envolvidos:**
  - `lib/wlg.js` (novo cliente HTTP REST para a API da WLG)
  - `api/nfe.js`
  - `CRONOGRAMA.md`
  - `GUIA_UPSTREAM_SINCRONIZACAO.md`
- **Ações a Executar:**
  1. Criar `lib/wlg.js` implementando autenticação JWT (`POST /api/v1/auth/token`), envio de NF-e (`POST /api/v1/nfe`) com determinação automática de CFOP (`5102` interno RS / `6102` interestadual) e consulta de PDF/XML.
  2. Integrar `api/nfe.js` para usar a API da WLG quando `WLG_CLIENT_ID` e `WLG_CLIENT_SECRET` estiverem presentes no ambiente (mantendo fallback de geração TXT/XML caso ainda não configuradas).
  3. Realizar commit, push para o GitHub (disparando o deploy na Vercel) e atualizar o `CRONOGRAMA.md` para 100%.
- **Passo de Validação:**
  - Testar chamada à rota `/api/nfe` validando o preenchimento automático de NCM e CFOP e confirmar o deploy ativo na Vercel.
- **Status:** [x] Concluído e Validado (SQLite Local + Turso Cloud)

