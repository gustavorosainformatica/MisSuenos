# Especificação Técnica: Documentação de API com Scalar (OpenAPI 3.0)

**Módulo:** Central de Documentação & Contratos de API (Developer Portal)  
**Projeto:** Mis Sueños ERP & Matriz ERP-BASE  
**Autor:** Gustavo Rosa Informática  
**Status:** Aprovado para Implementação  
**Padrão Visual:** Scalar API Reference (Tema DeepSpace / Dark)  

---

## 1. Visão Geral e Justificativa

O **Mis Sueños ERP** possui uma suíte extensa de serviços REST responsáveis por compras, vendas, estoque, finanças, fiscal e logística. 
Para garantir governança corporativa, facilitar manutenções futuras e permitir integrações externas seguras com e-commerces, Bling e automações, faz-se necessária a implantação de uma **Central de Documentação de API interativa, moderna e fechada**.

### Decisão Arquitetural Homologada:
- **Padrão de Especificação:** **OpenAPI 3.0.3 (OAS3)** estruturado no arquivo [`public/openapi.json`](file:///d:/projetos-agy/MisSuenos/public/openapi.json).
- **Interface Visual:** **Scalar API Reference** (estado da arte de 2026), oferecendo dark theme nativo, busca rápida (`Ctrl+K`), gerador de exemplos em 14 linguagens (cURL, Fetch, Node.js, Python) e painel interativo de testes.
- **Modelo de Segurança ("Mesmo que Fechada"):**
  1. No nível da API: Esquema de autenticação global via `X-API-KEY` e `Bearer Token`.
  2. No nível da interface: Rota `/api-docs` protegida, exigindo autenticação administrativa para visualização.
- **Blindagem de Infraestrutura:** Roteamento 100% centralizado através do Gateway Unificado [`api/index.js`](file:///d:/projetos-agy/MisSuenos/api/index.js), consumindo **zero** Serverless Functions adicionais na Vercel (respeitando o teto de 12 funções do plano Hobby).
- **Sincronização Tríplice:** Replicação obrigatória na matriz [`d:\projetos-agy\erp-base`](file:///d:/projetos-agy/erp-base) e no ambiente `MisSuenos-Dev`.

---

## 2. Escopo de Endpoints Mapeados

A especificação cobrirá 100% das rotas operacionais do ERP:

### A. Vendas & Pedidos (`/api/pedidos`)
- `GET /api/pedidos`: Listagem de pedidos com filtros de status (`AGUARDANDO_PAGAMENTO`, `EM_SEPARACAO`, `AGUARDANDO_ENVIO`, `ENVIADO`, `ENTREGUE`, `CANCELADO`), busca por cliente e paginação.
- `GET /api/pedidos/:id`: Detalhamento completo do pedido, frete, cliente e itens.
- `POST /api/pedidos`: Cadastro de pedido com reserva automática de estoque e geração de contas a receber pendente.
- `PUT /api/pedidos/:id`: Atualização de dados, transição de status no funil logístico e recálculo financeiro.
- `DELETE /api/pedidos/:id`: Cancelamento de pedido com estorno da reserva de estoque.

### B. Gestão de Clientes (`/api/clientes`)
- `GET /api/clientes`: Busca com normalização de acentos, filtro por UF e documento.
- `GET /api/clientes/:id`: Ficha cadastral completa com telefone e endereço.
- `POST /api/clientes`: Cadastro com validação estrita de CPF/CNPJ (Módulo 11), CEP e máscara de telefone.
- `PUT /api/clientes/:id`: Atualização cadastral higienizada em caixa alta.
- `DELETE /api/clientes/:id`: Inativação lógica do cliente.

### C. Catálogo & Estoque (`/api/produtos`)
- `GET /api/produtos`: Catálogo com SKU, preço de venda, custo, margem e saldo em estoque.
- `POST /api/produtos`: Cadastro de mercadorias e couros.
- `PUT /api/produtos/:id`: Atualização de preços e ficha do produto.
- `POST /api/produtos/:id/ajuste`: Ajuste rápido de estoque (`ENTRADA`, `SAIDA`, `BALANCO`).
- `GET /api/produtos/:id/kardex`: Extrato histórico de movimentações da ficha Kardex.
- `DELETE /api/produtos/:id`: Inativação do catálogo.

### D. Gestão Financeira & DRE (`/api/financeiro`)
- `GET /api/financeiro`: Títulos a pagar e a receber com filtros de status (`PENDENTE`, `PAGO`, `CANCELADO`).
- `POST /api/financeiro`: Novo lançamento com suporte a recorrência mensal (`recorrente: true`).
- `PUT /api/financeiro/:id`: Liquidação / baixa de título ou alteração de vencimento.
- `DELETE /api/financeiro/:id`: Cancelamento de lançamento.

### E. Inteligência Contábil & Relatórios (`/api/relatorios`)
- `GET /api/relatorios/dre_gerencial`: Apuração de DRE analítico com receita bruta, CMV, deduções e lucro líquido.
- `GET /api/relatorios/fluxo_caixa_projetado`: Projeção temporal de 30 dias com detecção de furo de caixa e previsão de 6 meses.
- `GET /api/relatorios/compras_cliente`: Histórico analítico de compras por cliente.
- `GET /api/relatorios/inventario`: Posição patrimonial valorada do estoque.

### F. Logística Ativa & Rastreamento (`/api/logistica`)
- `GET /api/logistica/rastreio/:codigo`: Consulta de movimentação de objetos nos Correios/transportadoras.
- `POST /api/logistica/vincular`: Associação de código de rastreio com disparo de comprovante via WhatsApp.

### G. Central Fiscal & Auditoria (`/api/nfe` e `/api/logs`)
- `GET /api/nfe`: Listagem de documentos fiscais emitidos.
- `POST /api/nfe/emitir`: Geração de espelho e lote NF-e.
- `GET /api/logs`: Trilha de auditoria das ações de operadores.

---

## 3. Arquitetura de Entrega & Segurança

### 3.1. Rota da Interface (`/api-docs`)
- Criada como uma página HTML minimalista ([`public/api-docs.html`](file:///d:/projetos-agy/MisSuenos/public/api-docs.html)) que renderiza o script do **Scalar** apontando para `/api/openapi.json`.
- Integrada ao tema `deepSpace` com modo escuro forçado, tipografia `JetBrains Mono` e busca instantânea (`Ctrl+K`).

### 3.2. Rota do Contrato (`/api/openapi.json`)
- O arquivo [`public/openapi.json`](file:///d:/projetos-agy/MisSuenos/public/openapi.json) serve como a fonte da verdade de schemas e exemplos.
- Despachado com cabeçalhos CORS (`Access-Control-Allow-Origin: *`) e `Content-Type: application/json`.

### 3.3. Atalho de Acesso no ERP
- No topo da aplicação desktop/mobile, no menu de configurações/sistema ([`public/index.html`](file:///d:/projetos-agy/MisSuenos/public/index.html)), é adicionado um botão de acesso rápido:
  `📑 Documentação da API` (abrindo `/api-docs` com proteção).

---

## 4. Critérios de Aceite

1. O arquivo `public/openapi.json` deve ser válido segundo a especificação OpenAPI 3.0.3, cobrindo todos os módulos listados com exemplos reais de payload e respostas.
2. A URL `/api-docs` deve renderizar perfeitamente a interface do Scalar em tema escuro sem erros de console.
3. Testes automatizados com `node --test` devem validar a sintaxe e a integridade do JSON de documentação.
4. O servidor web local ([`scripts/servidor_web.js`](file:///d:/projetos-agy/MisSuenos/scripts/servidor_web.js)) e o gateway Vercel ([`api/index.js`](file:///d:/projetos-agy/MisSuenos/api/index.js)) devem servir `/api-docs` e `/api/openapi.json` com status HTTP 200.
5. Sincronização e validação completa nos 3 repositórios (`MisSuenos`, `MisSuenos-Dev` e `erp-base`).
