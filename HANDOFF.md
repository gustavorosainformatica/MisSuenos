# Ponto de Retomada — 24 de Novembro de 2026

## ERP MisSuenos

- **Último assunto tratado:** Correção definitiva da busca/autocomplete de clientes no modal de Pedidos (bug intermitente de não carregar clientes para o operador Marcos) e integração da funcionalidade de Cadastro de Clientes PJ com consulta automática de CNPJ via BrasilAPI.
- **Causa Raiz Sanada:** A chamada `carregarDadosApi()` havia sido desatrelada da carga geral, fazendo com que o modal de pedidos abrisse com a base de clientes vazia (`[]`) se o operador não visitasse a aba Clientes antes.
- **Blindagem Aplicada:** Provedor memoizado universal `window.garantirBaseClientes()`, pré-aquecimento pós-login, garantia em `abrirModalNovoPedido` e `abrirModalEditarPedido`, auto-recuperação reativa com indicador visual e re-filtro automático na digitação, além de sincronização de Datalist.
- **Governança Global:** Criada a diretriz `config/rules/padrao-gerenciamento-dados-e-autocomplete.md` e referenciada no `GEMINI.md` para evitar acoplamento temporal em todos os ERPs.
- **Suíte de Testes:** Nova suíte `tests/pedidos_autocomplete_clientes.test.js` com 5 testes automatizados aprovados (31 testes no total da bateria).

---

# Registro de Transição de Contexto (Handoff)

**Data / Hora:** 15 de Novembro de 2026 — 20:25 (BRT)  
**Objetivo da Sessão:** Implementação completa da funcionalidade de **Ficha Técnica (BOM - Bill of Materials) & Ordens de Produção Artesanal (PCP em 1 Clique)** (Tickets 01 a 06 do fluxo Matt Pocock inspirado no ERPNext), com migração de schema DDL idempotente, persistência REST na API Serverless única, regras de cálculo e Kardex atômico com `origem: 'PRODUCAO'`, estorno completo, política de estoque flexível/estrita configurável pelo administrador, suíte TDD unitária e de integração (199 testes aprovados), UI moderna em Caixa Alta Universal com ergonomia de teclado e badges visuais, sincronização tríplice nos 3 repositórios (`MisSuenos`, `erp-base` e `MisSuenos-Dev`) e deploy auditado na Vercel com `HTTP 200 OK`.

---

## 1. O que foi Concluído nesta Sessão

1. **Ficha Técnica (BOM) & Ordens de Produção Artesanal:**
   - **Ticket 01 (Schema DDL & Banco):** Criado `scripts/migrar_schema_bom_producao.js` com DDL idempotente criando tabelas `produtos_bom` e `producao_ordens`, colunas `custo_adicional_producao` e `tipo_item` em `produtos`, índices e chave `producao_permitir_saldo_negativo` em `configuracoes_sistema`. DDLs incorporados em `lib/db.js`.
   - **Ticket 02 (Endpoints da API REST & Dispatcher Central):** Criado `api/producao.js` com suporte a `GET/POST /api/produtos/:id/bom`, `GET/POST /api/producao/ordens`, `POST /api/producao/ordens/:id/estornar`, `GET/POST /api/producao/config`. Despacho unificado em `api/index.js` (blindagem de cotas Serverless Hobby) e `scripts/servidor_web.js`. Atualizado `api/produtos.js` para persistir `custo_adicional_producao` e `tipo_item`.
   - **Ticket 03 (Motor de Cálculo & Suíte TDD):** Implementadas funções `calcularCustoProducaoBom` e `validarSaldoInsumos` em `lib/calculos_erp.js`. Criada suíte `tests/producao_bom.test.js` com 7 cenários completos (199 testes no total passando com 100% de sucesso).
   - **Ticket 04 (UI Ficha Técnica no Modal de Produtos):**
     * Modal de Produto (`#modal-produto`): campo `Custo Mão de Obra (R$)`, botão `🛠️ Ficha Técnica (BOM)` no rodapé.
     * Modal de Ficha Técnica (`#modal-bom`): KPIs de custo (Insumos + Mão de Obra = Previsto), Combobox pesquisável de matérias-primas, tabela de insumos com exclusão via `tabindex="-1"` e recálculo dinâmico.
   - **Ticket 05 (UI Central de Montagem Rápida & Estorno):**
     * Modal `#modal-producao`: Abas de "Nova Montagem em 1 Clique" e "Histórico de Ordens & Estornos".
     * Grade reativa de insumos com badges `🟢 DISPONÍVEL` / `🔴 FALTA: X`.
     * Botão para alternar política de estoque (Bloqueio estrito vs Permissão com aviso).
     * Histórico de ordens com botão `↩️ Estornar` que reverte saídas e entradas no Kardex e atualiza o status para `ESTORNADA`.
     * Acesso em 1 clique na Central de Ações Rápidas do painel e na toolbar do Estoque.
   - **Ticket 06 (Sincronização Tríplice & Deploy):**
     * `MisSuenos` (Produção): Commit e push para `main`, deploy auditado na Vercel com `HTTP 200 OK`.
     * `erp-base` (Matriz Universal Neutra): Sincronizado e testado (199 testes passando).
     * `MisSuenos-Dev` (Sandbox): Sincronizado e testado (199 testes passando).

---

## 2. Status dos Ambientes e Repositórios

- **Produção (Vercel):** [https://missuenos.vercel.app](https://missuenos.vercel.app)
- **Matriz Neutra (`d:\projetos-agy\erp-base`):** Sincronizada na branch `main`.
- **Sandbox (`D:\projetos-agy\sandbox\MisSuenos-Dev`):** Sincronizada na branch `dev`.
- **Suíte de Testes Automatizados:** 199 testes passando com 100% de sucesso (0 falhas).

---

## 3. Arquivos Modificados / Criados

- `scripts/migrar_schema_bom_producao.js` - Script de migração de schema com checagem idempotente.
- `lib/db.js` - DDLs das tabelas `produtos_bom` e `producao_ordens`, novas colunas e migrações.
- `lib/calculos_erp.js` - Funções `calcularCustoProducaoBom` e `validarSaldoInsumos`.
- `api/producao.js` - Endpoints REST de BOM, Ordens de Produção, Estorno e Configuração.
- `api/produtos.js` - Suporte a `custo_adicional_producao` e `tipo_item` no POST e PUT.
- `api/index.js` - Dispatcher central com rotas de produção integradas.
- `scripts/servidor_web.js` - Paridade de despacho local para desenvolvimento.
- `public/index.html` - Modais `#modal-bom` e `#modal-producao`, botões na toolbar de estoque e Central de Ações, controladores reativos.
- `tests/producao_bom.test.js` - Suíte TDD com 7 testes cobrindo todo o ciclo operacional.
- `docs/specs/SPEC-ficha-tecnica-bom-producao.md` - Especificação técnica formal.
- `docs/tickets/TICKETS-ficha-tecnica-bom-producao.md` - Planejamento e checklist dos tickets.
- `HANDOFF.md` - Atualização do registro de transição de contexto.
