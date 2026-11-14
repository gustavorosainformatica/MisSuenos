# Plano de Execução em Tickets: Redimensionamento e Auto-Ajuste de Colunas

> **Baseado em:** [SPEC_REDIMENSIONAMENTO_COLUNAS.md](file:///d:/projetos-agy/clientes/MisSuenos/docs/SPEC_REDIMENSIONAMENTO_COLUNAS.md)  
> **Status:** Pronto para Execução (`/implement-spec`)  
> **Metodologia:** TDD Incremental, Isolamento de Riscos e Sincronização Tríplice  

---

### Ticket 01: CSS da Alça Divisória e Guia Neon de Arraste
- **Objetivo:** Definir a camada visual para a divisória de colunas interativa e a linha guia de arraste em tempo real no padrão corporativo escuro/ciano do ERP.
- **Arquivos Envolvidos:** `public/index.html` (seção `<style>`).
- **Ações a Executar:**
  1. Configurar `table.erp-table thead th` com `position: relative; overflow: visible;`.
  2. Criar a classe `.th-resizer` (posição absoluta na borda direita, largura de 8px, `cursor: col-resize`, `z-index: 10`, `user-select: none`).
  3. Adicionar feedback visual suave no `:hover` e estado ativo `.is-resizing` com linha vertical ciano neon (`#00d4ff`) e sombra sutil.
  4. Adicionar classe utilitária `body.is-resizing-col` para travar a seleção de texto e forçar o cursor `col-resize` durante o movimento do mouse.
- **Passo de Validação:**
  - Inspeção de sintaxe e verificação da injeção correta das classes no bloco de estilo.
- **Status:** [ ] Pendente

---

### Ticket 02: Injeção de Resizers e Blindagem Anti-Conflito com Drag-and-Drop
- **Objetivo:** Injetar os elementos `.th-resizer` em todos os cabeçalhos das tabelas core e blindar contra disparo indevido da reordenação de colunas.
- **Arquivos Envolvidos:** `public/index.html` (seção `<script>`).
- **Ações a Executar:**
  1. Implementar a função `habilitarRedimensionamentoTabela(tabela)` acoplada ao ciclo de vida da tabela.
  2. Filtrar colunas protegidas (checkbox `data-col="check"` e `th-nao-arrastavel`), mantendo-as com largura fixa.
  3. Injetar a `<div class="th-resizer" title="Arraste para redimensionar ou dê dois cliques para auto-ajustar"></div>` no final de cada `th` elegível.
  4. Adicionar listeners no resizer com `e.stopPropagation()` no `mousedown` e `dragstart` para impedir que o navegador confunda redimensionamento com o drag de ordenação existente.
- **Passo de Validação:**
  - Validação no DOM de que as 4 tabelas (`#tabela-clientes`, `#tabela-pedidos`, `#tabela-produtos`, `#tabela-financeiro`) possuem resizers ativos sem interferir na reordenação.
- **Status:** [ ] Pendente

---

### Ticket 03: Motor de Arraste Manual e Persistência no LocalStorage
- **Objetivo:** Permitir ao operador clicar e arrastar a divisória para ajustar a largura da coluna livremente, salvando o valor no navegador.
- **Arquivos Envolvidos:** `public/index.html`.
- **Ações a Executar:**
  1. Implementar `iniciarArrasteLarguraColuna(e, th, resizer, tabela)` capturando coordenadas `pageX` e largura inicial.
  2. Registrar eventos globais de `mousemove` e `mouseup` com clamp seguro (`Math.max(50, Math.min(600, novaLargura))`).
  3. Criar `salvarLargurasColunasTabela(tabela)` persistindo o mapa `{ [col]: widthPx }` em `localStorage.getItem('erp_col_widths_' + tabela.id)`.
  4. Criar `aplicarLargurasColunasSalvas(tabela)` para ler do `localStorage` e restaurar as larguras salvas ao abrir a tela ou alternar módulos.
- **Passo de Validação:**
  - Teste de simulação de alteração de largura e leitura do `localStorage`.
- **Status:** [ ] Pendente

---

### Ticket 04: Auto-Ajuste com Duplo Clique (Auto-Fit) e Opção de Restaurar Padrão
- **Objetivo:** Implementar o comportamento nativo do Windows Explorer onde dois cliques rápidos na borda auto-ajustam a coluna ao maior conteúdo visível.
- **Arquivos Envolvidos:** `public/index.html`.
- **Ações a Executar:**
  1. Adicionar evento `dblclick` na divisória `.th-resizer` disparando `autoAjustarLarguraColuna(th, tabela)`.
  2. O algoritmo mede o maior `scrollWidth` entre as células `td` visíveis daquela coluna e o título do `th`, somando 24px de respiro (com piso de 50px e teto de 500px).
  3. Persistir a nova largura calculada imediatamente no `localStorage`.
  4. Adicionar opção *"Restaurar Larguras Padrão"* no menu de contexto de cabeçalho (`abrirMenuConfiguracaoColunas`), permitindo ao usuário resetar as larguras customizadas a qualquer momento.
- **Passo de Validação:**
  - Teste do cálculo de auto-ajuste e restauração de padrão via comando de menu.
- **Status:** [ ] Pendente

---

### Ticket 05: Suíte de Testes Automatizados TDD
- **Objetivo:** Blindar todo o comportamento da nova ferramenta com testes automatizados executados via Node.js test runner.
- **Arquivos Envolvidos:** `tests/colunas_resizer.test.js`.
- **Ações a Executar:**
  1. Criar `tests/colunas_resizer.test.js`.
  2. Testar injeção das alças divisórias e classes CSS.
  3. Testar clamp matemático de redimensionamento (mínimo 50px, máximo 600px).
  4. Testar algoritmo de auto-ajuste (cálculo de largura ideal).
  5. Testar persistência, sanitização e recuperação do `localStorage`.
  6. Garantir que 100% dos testes existentes continuem verdes.
- **Passo de Validação:**
  - Executar `npm test` e verificar aprovação completa de todos os testes.
- **Status:** [ ] Pendente

---

### Ticket 06: Sincronização Tríplice e Auditoria Obrigatória de Deploy na Nuvem
- **Objetivo:** Replicar a inovação para os repositórios irmãos e validar o deploy em produção.
- **Arquivos Envolvidos:** Repositórios `MisSuenos`, `erp-base` e `MisSuenos-Dev`.
- **Ações a Executar:**
  1. Sincronizar as alterações em `d:\projetos-agy\erp-base` e rodar `npm test`.
  2. Sincronizar em `D:\projetos-agy\sandbox\MisSuenos-Dev` e rodar `npm test`.
  3. Commitar e realizar `git push origin main` no `MisSuenos`.
  4. Auditar o deploy na nuvem via API do GitHub até atingir `state: success` e validar via HTTP em `https://missuenos.vercel.app`.
  5. Commitar e realizar push em `erp-base` e `MisSuenos-Dev`.
- **Passo de Validação:**
  - GitHub Commit Status com `state: success` e resposta `200 OK` na Vercel.
- **Status:** [ ] Pendente
