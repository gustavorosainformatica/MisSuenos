# Especificação Técnica: Múltiplas Tabelas de Preço (Varejo vs. Atacado) & Motor Híbrido de Vendas

> **Status:** Aguardando Aprovação (Proceed ➔ /to-tickets)  
> **Autor:** Antigravity AI & Gustavo Rosa Informática  
> **Data:** 15 de Novembro de 2026  
> **Versão:** 1.0  
> **Módulos Afetados:** Produtos & Catálogo, Clientes & CRM, Pedidos de Venda & Checkout, Migração de Banco e Testes Automatizados.

---

## 1. Visão Geral e Contexto

No comércio de couros, peles, selaria e na matriz universal do ERP, as vendas operam em dois mundos distintos:
1. **Varejo (Consumidor Final / Balcão):** Venda em pequenas quantidades, preço cheio de catálogo.
2. **Atacado (Lojistas, Artesãos, Revendedores e Produtores):** Venda em volume com margem diferenciada.

Atualmente, o sistema possui apenas um único campo de `preco_venda` fixo no cadastro do produto. Para atender clientes de atacado ou pedidos em lote, o operador é obrigado a calcular e digitar descontos manualmente linha a linha, gerando atritos, lentidão de atendimento e risco de erros de caixa.

Inspirado nas melhores práticas de maturidade do **ERPNext**, esta funcionalidade adiciona suporte nativo a **Duas Tabelas de Preço Nativas (Varejo e Atacado)** operando através de um **Motor Híbrido Inteligente**, onde o preço correto é resolvido automaticamente pelo perfil do cliente, pela quantidade no carrinho ou por alternância manual em 1 clique.

---

## 2. Metas e Fora de Escopo

### 2.1. Metas Principais (In-Scope)
- **Extensão do Modelo de Dados:**
  - Adicionar `preco_atacado` (REAL) e `qtd_minima_atacado` (REAL, padrão: 5) na tabela `produtos`.
  - Adicionar `tabela_preco` (TEXT, valores: `'VAREJO'` ou `'ATACADO'`, padrão: `'VAREJO'`) na tabela `clientes`.
  - Migração de schema limpa, segura e idempotente para SQLite local e Turso Cloud (`scripts/migrar_schema_tabelas_preco.js`).
- **Motor Híbrido de Resolução de Preços:**
  - Ativação de Atacado quando:
    - O cliente selecionado tiver perfil `ATACADO`; **OU**
    - O operador alternar manualmente o seletor `🏷️ TABELA: ATACADO` no topo do pedido; **OU**
    - A quantidade informada no item for $\ge$ `qtd_minima_atacado` (mesmo para clientes de varejo).
- **Fallback Automático e Seguro:**
  - Se o preço de atacado for nulo, indefinido, vazio ou zero, assume automaticamente o `preco_venda` (varejo normal), garantindo que nenhum item seja cobrado por zero e a venda nunca trave.
  - Exibição de badge/alerta visual no item: `⚠️ Sem preço atacado (usando varejo)`.
- **Experiência do Usuário (UI/UX & Ergonomia de Teclado):**
  - Campos de preço de atacado e quantidade mínima integrados no modal de produtos, com navegação por `Tab` e sem spinners numéricos.
  - Dropdown pesquisável (Combobox) no pedido exibindo o preço ativo da tabela selecionada em tempo real com destaque visual.
  - Reatividade imediata: alterar a quantidade de um item no pedido para $\ge$ quantidade mínima converte o preço para atacado na hora.
- **Sincronização Tríplice e Cobertura de Testes:**
  - Suíte TDD cobrindo todos os cenários de precificação e regressão.
  - Sincronização 100% alinhada entre `MisSuenos`, `erp-base` e `MisSuenos-Dev`.

### 2.2. Fora de Escopo (Non-Goals)
- Criação de tabelas ilimitadas customizadas (ex: "Tabela VIP SP 2026", "Tabela Queima de Estoque"); mantemos o modelo enxuto e de alta performance de 2 tabelas universais (*Varejo* e *Atacado*).
- Precificação dinâmica baseada em cotação de câmbio de moedas estrangeiras no checkout (as cotações do painel permanecem informativas).
- Comissão escalonada de vendedores por tabela de preço (será tratado em módulo específico futuro).

---

## 3. Arquitetura e Fluxo de Execução

```mermaid
flowchart TD
    A["Início do Pedido / Seleção de Item"] --> B["Verificar Perfil do Cliente"]
    B -->|Cliente = ATACADO| C["Tabela Base: ATACADO"]
    B -->|Cliente = VAREJO ou Avulso| D["Tabela Base: VAREJO"]
    
    C --> E{"Operador alterou seletor manual?"}
    D --> E
    
    E -->|Forçou VAREJO| F["Modo Efetivo: VAREJO"]
    E -->|Forçou ATACADO| G["Modo Efetivo: ATACADO"]
    E -->|Mantém Padrão| H["Modo Efetivo Conforme Cliente"]
    
    F --> I{"Qtd Item >= Qtd Mínima Atacado?"}
    H --> I
    G --> J["Aplicar Preço de Atacado"]
    
    I -->|Sim (Gatilho por Qtd)| J
    I -->|Não| K["Aplicar Preço de Varejo"]
    
    J --> L{"Produto possui preco_atacado > 0?"}
    L -->|Sim| M["Preço Final = preco_atacado"]
    L -->|Não (Ausente ou Zero)| N["Preço Final = preco_venda\n(Alerta: Sem preço atacado)"]
    
    K --> O["Preço Final = preco_venda"]
    
    M --> P["Recalcular Subtotal e Total do Pedido"]
    N --> P
    O --> P
```

---

## 4. Contratos de Dados e Interfaces

### 4.1. Esquema do Banco de Dados (SQLite / Turso)

```sql
-- Extensão na tabela 'produtos'
ALTER TABLE produtos ADD COLUMN preco_atacado REAL DEFAULT NULL;
ALTER TABLE produtos ADD COLUMN qtd_minima_atacado REAL DEFAULT 5.0;

-- Extensão na tabela 'clientes'
ALTER TABLE clientes ADD COLUMN tabela_preco TEXT DEFAULT 'VAREJO';
```

### 4.2. Payloads da API REST

#### `POST /api/produtos` e `PUT /api/produtos/:id`
```json
{
  "nome": "PASSADOR TRANÇADO DE COURO GRANDE",
  "categoria": "ARTEFATOS",
  "preco_custo": 12.00,
  "preco_venda": 25.00,
  "preco_atacado": 19.50,
  "qtd_minima_atacado": 5.0,
  "estoque_atual": 40.0
}
```

#### `POST /api/clientes` e `PUT /api/clientes/:id`
```json
{
  "nome": "SELARIA & ARTESANATO CENTRAL LTDA",
  "cpf": "",
  "cnpj": "12.345.678/0001-90",
  "tabela_preco": "ATACADO",
  "cidade": "SÃO BORJA",
  "uf": "RS"
}
```

#### `POST /api/pedidos`
```json
{
  "cliente_id": 142,
  "cliente_nome": "SELARIA & ARTESANATO CENTRAL LTDA",
  "tabela_preco_aplicada": "ATACADO",
  "itens_detalhados": [
    {
      "id": 23,
      "nome": "PASSADOR TRANÇADO DE COURO GRANDE",
      "qtd": 10,
      "tabela_item": "ATACADO",
      "preco_unitario": 19.50,
      "subtotal": 195.00
    }
  ],
  "valor_total": 195.00
}
```

### 4.3. Padrões de UI/UX e Ergonomia de Teclado
- **Formulário de Produtos (`#modal-novo-produto`):**
  - Linha de precificação com 3 colunas proporcionais: `Preço de Custo (R$)`, `Preço de Venda (R$)` e `Preço de Atacado (R$)`.
  - Campo auxiliar `Qtd. Mínima Atacado` posicionado logo abaixo com placeholder `5 (PADRÃO)`.
  - Navegação por `Tab` direta entre valores monetários; remoção universal de spinners via CSS.
- **Formulário de Clientes (`#modal-novo-cliente`):**
  - Seletor estilizado: `🏷️ TABELA DE PREÇO: [ VAREJO (PADRÃO) ▼ / ATACADO ]`.
- **Checkout / Modal de Pedidos de Venda (`#modal-pedido`):**
  - **Toolbar Superior do Pedido:** Botão seletor com badge: `🏷️ TABELA DO PEDIDO: [ VAREJO ▼ / ATACADO ]`.
  - Ao selecionar um cliente no Combobox: o seletor do pedido atualiza automaticamente para a tabela padrão daquele cliente.
  - No Combobox de seleção de produto: exibe a indicação do preço ativo (ex: `R$ 19,50 (ATACADO)` ou `R$ 25,00 (VAREJO)`).
  - Ao alterar a quantidade do item na linha:
    - Se a quantidade for $\ge$ `qtd_minima_atacado`, o preço unitário ajusta-se automaticamente para atacado e exibe o badge discreto `[ATACADO 5+ un]`.

---

## 5. Tratamento de Exceções, Casos de Borda e Integridade

1. **Produto sem Preço de Atacado Cadastrado (`preco_atacado IS NULL` ou `= 0`):**
   - O motor nunca atribui valor $0,00$. Aplica o `preco_venda` normal e marca o item com aviso visual transparente.
2. **Cliente com Tabela Indefinida ou Banco Legado:**
   - Fallback automático para `'VAREJO'` caso `tabela_preco` venha vazia ou indefinida.
3. **Idempotência da Migração de Banco:**
   - O script `migrar_schema_tabelas_preco.js` consulta `PRAGMA table_info` antes de disparar `ALTER TABLE`, evitando falhas caso as colunas já tenham sido criadas.
4. **Compatibilidade com Itens em Formato Texto Legado:**
   - O parser legador `parseItensLegados` mantém total compatibilidade, extraindo quantidades e valores sem quebras em pedidos históricos.
5. **Bloqueio de Valores Negativos:**
   - Validação preventiva impedindo `preco_atacado < 0` ou `qtd_minima_atacado <= 0`.

---

## 6. Critérios de Aceite e Testes Automatizados (TDD)

### 6.1. Suíte de Testes Automatizados (`tests/tabelas_preco.test.js`)
- [ ] **Teste 01:** Migração de schema adiciona `preco_atacado`, `qtd_minima_atacado` e `tabela_preco` sem perda de dados.
- [ ] **Teste 02:** Cliente com `tabela_preco = 'ATACADO'` puxa `preco_atacado` automaticamente ao selecionar produto.
- [ ] **Teste 03:** Cliente com `tabela_preco = 'VAREJO'` que atinge `qtd >= qtd_minima_atacado` converte para `preco_atacado`.
- [ ] **Teste 04:** Produto sem `preco_atacado` faz fallback seguro para `preco_venda` em modo atacado.
- [ ] **Teste 05:** Alternância manual da tabela no pedido recalcula os preços dos itens no carrinho.
- [ ] **Teste 06:** Persistência do pedido grava `tabela_preco_aplicada` e valores unitários corretos.

### 6.2. Sincronização Tríplice & Deploy
- [ ] Implementação e testes aprovados com 100% de sucesso em `d:\projetos-agy\clientes\MisSuenos`.
- [ ] Sincronização e validação completa em `d:\projetos-agy\erp-base` (184+ testes passando).
- [ ] Sincronização e validação em `D:\projetos-agy\sandbox\MisSuenos-Dev`.
- [ ] Git commit e push com auditoria de deploy na Vercel (`Deployment has completed`).
