# Especificação Técnica: Redimensionamento e Auto-Ajuste de Colunas (Estilo Windows Explorer)

> **Status:** Proposta Aprovada na Sabatina (`/grill-me`)  
> **Módulo:** Interface / DataGrid Universal (`table.erp-table`)  
> **Repositórios Impactados:** `MisSuenos`, `erp-base`, `MisSuenos-Dev`  
> **Data:** 13/11/2026  

---

## 1. Visão Geral e Contexto
Atualmente, as tabelas corporativas do ERP possuem suporte à reordenação de colunas via drag-and-drop e alternância de visibilidade. Contudo, as larguras das colunas são semi-estáticas (definidas via CSS/inline).

Esta especificação define a arquitetura para **Redimensionamento Manual e Auto-Ajuste (Auto-Fit)** de colunas em todas as tabelas corporativas (`table.erp-table`), reproduzindo com fidelidade a ergonomia e precisão visual do **Windows Explorer** e **Microsoft Excel**.

---

## 2. Metas e Fora de Escopo

### 🎯 Metas Principais
1. **Alça Divisória Interativa (`.th-resizer`):** Cada coluna (`th`) elegível recebe uma alça invisível com área de clique ergonômica de 8px e cursor `col-resize` na borda direita.
2. **Guia Visual de Arraste em Tempo Real:** Ao passar o mouse ou durante o arraste da divisória, exibir linha vertical ciano neon (`#00d4ff`) destacando o divisor de coluna.
3. **Redimensionamento Manual Suave:** Arrastar a alça altera dinamicamente a largura da coluna com limites seguros (mínimo de **50px** e máximo de **600px**).
4. **Auto-Ajuste com Duplo Clique (Auto-Fit Windows):** Dar dois cliques rápidos na alça divisória aciona o cálculo instantâneo da largura ideal da coluna, medindo o maior conteúdo entre as linhas visíveis do `tbody` e o título do cabeçalho (+ respiro ergonômico de 24px).
5. **Persistência Inteligente:** Gravar as larguras customizadas no `localStorage` por tabela (`erp_col_widths_<tabelaId>`), restaurando-as automaticamente ao carregar a página ou trocar de aba.
6. **Restauração em 1 Clique:** Opção *"Restaurar Larguras Padrão"* integrada ao menu de contexto de cabeçalho da tabela.
7. **Isolamento de Conflito com Drag-and-Drop:** Interceptar `e.stopPropagation()` na alça divisória para que redimensionar nunca dispare acidentalmente o arraste de mover de lugar.
8. **Blindagem de Colunas Especiais:** Colunas com `th-nao-arrastavel` ou checkbox de seleção múltipla (`data-col="check"`) permanecem com largura travada (35px) e protegidas contra redimensionamento.

### 🚫 Fora de Escopo (Non-Goals)
- Tabelas secundárias ou informativas de sub-modais de auditoria rápida.
- Sincronização de larguras no banco de dados na nuvem (foco em `localStorage` para resposta instantânea e suporte offline).

---

## 3. Arquitetura e Fluxo de Execução

### Componentes Técnicos
1. **Estilos CSS (`public/index.html`):**
   - `th { position: relative; overflow: visible; }`
   - `.th-resizer`: `position: absolute; right: -4px; top: 0; bottom: 0; width: 8px; cursor: col-resize; z-index: 10;`
   - `.th-resizer:hover`, `.th-resizer.is-resizing`: linha guia ciano com `border-right: 2px solid #00d4ff;`
   - `body.is-resizing-col`: `cursor: col-resize !important; user-select: none !important;`
2. **Funções JavaScript:**
   - `inicializarRedimensionamentoColunasGlobal()`: mapeia `document.querySelectorAll('table.erp-table')`.
   - `habilitarRedimensionamentoTabela(tabela)`: injeta resizers e vincula listeners de mouse e dblclick.
   - `autoAjustarLarguraColuna(th, tabela)`: calcula o `scrollWidth` das células da coluna correspondente.
   - `salvarLargurasColunasTabela(tabela)`: serializa mapa `{ [colName]: widthPx }` no `localStorage`.
   - `aplicarLargurasColunasSalvas(tabela)`: desserializa e aplica `th.style.width` correspondente.

---

## 4. Contrato de Dados (LocalStorage)

Chave: `erp_col_widths_<id_da_tabela>`

Exemplo para `tabela-clientes`:
```json
{
  "check": 35,
  "id": 80,
  "nome": 280,
  "doc": 140,
  "cidade": 160,
  "uf": 65,
  "tel": 150
}
```

---

## 5. Tratamento de Casos de Borda e Erros

| Caso de Borda | Risco | Mitigação Arquitetural |
| :--- | :--- | :--- |
| **Arrastar além dos limites** | Coluna sumir ou quebrar o layout | Clamp matemático estrito: `Math.max(50, Math.min(600, width))` |
| **Conflito com Drag de Ordem** | Mover de posição ao tentar redimensionar | `.th-resizer` possui `draggable="false"` e chama `e.stopPropagation()` no `mousedown` e `dragstart` |
| **Tabela sem registros** | Duplo clique em coluna vazia | Auto-ajuste usa o `scrollWidth` do cabeçalho `th` + 24px com fallback para o piso de 80px |
| **Cache corrompido** | Larguras inválidas salvas | `try/catch` na leitura de `JSON.parse` com validação de número positivo |
| **Reset do Usuário** | Operador desajustou as larguras | Botão *"Restaurar Larguras Padrão"* no menu de contexto do cabeçalho |

---

## 6. Critérios de Aceite e Testes (TDD)

1. **Critério 1 - Divisores Visíveis:** Todas as 4 tabelas core (`#tabela-clientes`, `#tabela-pedidos`, `#tabela-produtos`, `#tabela-financeiro`) contêm divisores interativos em seus cabeçalhos.
2. **Critério 2 - Redimensionamento Manual:** Arrastar a alça altera o `th.style.width` e reflete nas células da tabela.
3. **Critério 3 - Auto-Ajuste com Duplo Clique:** Dois cliques na alça expandem/contraem a coluna exatamente para o tamanho do maior texto visível.
4. **Critério 4 - Persistência:** Ao recarregar a página (`F5`), as larguras definidas pelo operador permanecem idênticas.
5. **Critério 5 - Testes Automatizados:** Suíte de testes `tests/colunas_resizer.test.js` criada com 100% de aprovação.
6. **Critério 6 - Sincronização Tríplice:** Código sincronizado em `MisSuenos`, `erp-base` e `MisSuenos-Dev`.
7. **Critério 7 - Auditoria Vercel:** Deploy em produção verificado via GitHub API com status `success`.
