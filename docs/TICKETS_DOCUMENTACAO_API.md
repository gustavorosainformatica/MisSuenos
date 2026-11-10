# Tickets de Implementação: Documentação de API no ERP (Scalar OpenAPI 3.0)

**Referência:** [`docs/SPEC_DOCUMENTACAO_API.md`](file:///d:/projetos-agy/MisSuenos/docs/SPEC_DOCUMENTACAO_API.md)  
**Projeto:** Mis Sueños ERP & Matriz ERP-BASE  
**Fluxo:** `/implement-spec`  

---

### [Ticket 1] Criação do Contrato OpenAPI 3.0 (`public/openapi.json`)
- **Objetivo:** Estruturar a especificação OpenAPI 3.0.3 cobrindo 100% das rotas de Vendas (`/api/pedidos`), Clientes (`/api/clientes`), Estoque (`/api/produtos`), Financeiro (`/api/financeiro`), Relatórios (`/api/relatorios`), Logística (`/api/logistica`) e Fiscal (`/api/nfe`).
- **Critério de Aceite:**
  - JSON válido e formatado com tags, descrições em PT-BR, schemas de request body e respostas 200/201/400/404.
  - Segurança configurada com esquemas `ApiKeyAuth` e `BearerAuth`.

---

### [Ticket 2] Interface Interativa com Scalar API Reference (`public/api-docs.html`)
- **Objetivo:** Criar o ponto de entrada visual da documentação utilizando a biblioteca **Scalar API Reference**.
- **Critério de Aceite:**
  - Tema `deepSpace` ativo, tipografia proporcional e busca por `Ctrl+K`.
  - Consumo direto de `/api/openapi.json` e suporte a teste de requisições interativas.

---

### [Ticket 3] Roteamento Unificado e Blindagem de Cotas
- **Objetivo:** Integrar as rotas `/api-docs` e `/api/openapi.json` tanto no servidor local ([`scripts/servidor_web.js`](file:///d:/projetos-agy/MisSuenos/scripts/servidor_web.js)) quanto no gateway serverless unificado ([`api/index.js`](file:///d:/projetos-agy/MisSuenos/api/index.js)).
- **Critério de Aceite:**
  - Zero arquivos soltos na Vercel que excedam o limite de 12 funções.
  - Respostas HTTP 200 com Content-Type correto (`text/html` e `application/json`).

---

### [Ticket 4] Atalho Integrado na Interface do ERP (`public/index.html`)
- **Objetivo:** Adicionar atalho rápido `📑 Documentação da API` no menu de configurações e opções do topo do ERP.
- **Critério de Aceite:**
  - Abre a documentação em nova aba ou janela mantendo a ergonomia fluida.

---

### [Ticket 5] Suíte de Testes Automatizados TDD (`tests/openapi.test.js`)
- **Objetivo:** Criar testes com o test runner nativo do Node.js (`node --test`) para validar a consistência e conformidade do OpenAPI.
- **Critério de Aceite:**
  - Testes passando com 100% de sucesso sem regressão dos 50 testes existentes.

---

### [Ticket 6] Sincronização Tríplice & Auditoria de Deploy
- **Objetivo:** Replicar as melhorias no `MisSuenos-Dev` e na matriz neutra `d:\projetos-agy\erp-base`, executar commits, efetuar `git push` e auditar o build na nuvem via Vercel.
- **Critério de Aceite:**
  - Status HTTP 200 e confirmação de deploy ativo em produção.

