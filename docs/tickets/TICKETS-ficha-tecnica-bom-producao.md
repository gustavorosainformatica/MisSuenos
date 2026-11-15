# Tickets de Execução: Ficha Técnica (BOM) & Ordens de Produção Artesanal

Este plano decompõe a especificação técnica em 6 tickets atômicos e ordenados para implementação metódica via TDD.

---

### Ticket 01: Migração de Schema DDL & Inicialização de Banco (Idempotente)
- **Objetivo:** Criar e migrar o schema do banco de dados (SQLite local e Turso Cloud) para suportar tabelas de Ficha Técnica (`produtos_bom`), Ordens de Produção (`producao_ordens`), novas colunas de produtos e chave de configuração.
- **Arquivos Envolvidos:**
  - `scripts/migrar_schema_bom_producao.js` (Novo)
  - `lib/db.js` (Modificado)
- **Ações a Executar:**
  1. Criar script de migração idempotente verificando existência de tabelas e colunas com `PRAGMA table_info`.
  2. Adicionar DDLs de `produtos_bom` e `producao_ordens` no `lib/db.js`.
  3. Adicionar colunas `custo_adicional_producao` e `tipo_item` na tabela `produtos`.
  4. Inserir chave padrão `producao_permitir_saldo_negativo` = `'0'` em `configuracoes_sistema`.
- **Passo de Validação:**
  - Executar `node scripts/migrar_schema_bom_producao.js` e validar criação sem erros em bancos existentes e novos.
- **Status:** [ ] Pendente

---

### Ticket 02: Endpoints REST & Despacho Central na API
- **Objetivo:** Implementar as rotas de API para consulta/atualização de BOM, listagem e criação de Ordens de Produção, estorno e configuração de política de estoque, despachadas pelo `api/index.js` (respeito estrito ao limite serverless Hobby).
- **Arquivos Envolvidos:**
  - `api/producao.js` (Novo)
  - `api/index.js` (Modificado)
  - `api/produtos.js` (Modificado)
  - `scripts/servidor_web.js` (Modificado)
- **Ações a Executar:**
  1. Criar `api/producao.js` com rotas:
     - `GET /api/produtos/:id/bom` e `POST /api/produtos/:id/bom`
     - `GET /api/producao/ordens` e `POST /api/producao/ordens`
     - `POST /api/producao/ordens/:id/estornar`
     - `GET /api/producao/config` e `POST /api/producao/config`
  2. Registrar o roteador central no `api/index.js` e espelhar no servidor local `scripts/servidor_web.js`.
  3. Garantir suporte a `custo_adicional_producao` e `tipo_item` no `api/produtos.js`.
- **Passo de Validação:**
  - Requisição de teste via script Node local validando retorno `200 OK` e schemas JSON esperados.
- **Status:** [ ] Pendente

---

### Ticket 03: Motor de Produção, Kardex & Suíte TDD
- **Objetivo:** Implementar regras de negócio com transação atômica no Kardex (`estoque_movimentacoes` com `origem: 'PRODUCAO'`), cálculo de custos teóricos/reais, validação de saldo e blindagem preventiva de numeração `#OP-XXXX`.
- **Arquivos Envolvidos:**
  - `lib/calculos_erp.js` (Modificado)
  - `tests/producao_bom.test.js` (Novo)
- **Ações a Executar:**
  1. Criar suíte de testes unitários cobrindo:
     - Cálculo de custo teórico da BOM.
     - Validação de insumos com bloqueio estrito vs permissão de saldo negativo.
     - Montagem direta gerando saídas de insumos e entrada de acabado no Kardex.
     - Estorno da OP devolvendo insumos e baixando acabados.
     - Blindagem dupla de numeração `#OP-0001` evitando colisões `UNIQUE`.
  2. Implementar as funções de cálculo e execução garantindo 100% de aprovação nos testes.
- **Passo de Validação:**
  - Rodar `npm test` e verificar aprovação completa de todos os testes unitários.
- **Status:** [ ] Pendente

---

### Ticket 04: UI/UX - Gestão da Ficha Técnica no Modal de Produtos
- **Objetivo:** Adicionar a interface de configuração de Ficha Técnica no modal de produtos, permitindo montar a lista de insumos com busca inteligente e custo total em tempo real.
- **Arquivos Envolvidos:**
  - `public/index.html` (Modificado)
- **Ações a Executar:**
  1. Adicionar botão `🛠️ Ficha Técnica (BOM)` no `#modal-produto`.
  2. Criar modal secundário ou gaveta `#modal-bom` para selecionar insumos via Combobox pesquisável, digitar quantidades e definir custo adicional de mão de obra.
  3. Totalizador de custo dinâmico e ergonomia de teclado (`Tab` restrito a digitáveis, `tabindex="-1"` em botões secundários, remoção de spinners).
- **Passo de Validação:**
  - Testar fluxo de cadastro de BOM de produto sintético e verificar persistência visual.
- **Status:** [ ] Pendente

---

### Ticket 05: UI/UX - Central de Montagem Rápida & Estorno de Produção
- **Objetivo:** Criar o modal de Montagem Rápida em 1 clique (`#modal-producao`) na Central de Ações Rápidas do painel/estoque, com grade de insumos, indicadores de disponibilidade e histórico de ordens com botão de estorno.
- **Arquivos Envolvidos:**
  - `public/index.html` (Modificado)
- **Ações a Executar:**
  1. Adicionar atalho `⚡ Produzir / Montar` na toolbar de Estoque e na Central de Ações Rápidas.
  2. Criar modal `#modal-producao` com Combobox de produtos fabricáveis e campo de quantidade.
  3. Grade reativa exibindo saldo atual vs necessário com badges `🟢 DISPONÍVEL` ou `🔴 INSUFICIENTE`.
  4. Respeito à configuração de estoque negativo (bloqueia o botão com aviso ou permite com toast de alerta).
  5. Aba/tabela de histórico de ordens recentes com opção de `↩️ Estornar Produção`.
- **Passo de Validação:**
  - Realizar montagem de produto teste, verificar atualização de saldos em tela e testar o estorno.
- **Status:** [ ] Pendente

---

### Ticket 06: Sincronização Tríplice & Auditoria de Deploy na Nuvem
- **Objetivo:** Replicar com segurança as melhorias para a matriz neutra `erp-base` e para o ambiente `MisSuenos-Dev`, auditar a suíte completa de testes e validar o deploy na Vercel com resposta `HTTP 200 OK`.
- **Arquivos Envolvidos:**
  - Repositório `MisSuenos` (branch `main`)
  - Repositório `erp-base` (branch `main`)
  - Repositório `MisSuenos-Dev` (branch `dev`)
  - `HANDOFF.md` em todos os repositórios
- **Ações a Executar:**
  1. Executar suíte completa de testes (`npm test`) em todos os repositórios.
  2. Commit com mensagem semântica e push para os remotes correspondentes.
  3. Auditar o deploy na nuvem (`https://missuenos.vercel.app`) confirmando `HTTP 200 OK`.
  4. Atualizar os registros de continuidade em `HANDOFF.md`.
- **Passo de Validação:**
  - Testes passando 100% nos 3 ambientes e status HTTP verificado em produção.
- **Status:** [ ] Pendente
