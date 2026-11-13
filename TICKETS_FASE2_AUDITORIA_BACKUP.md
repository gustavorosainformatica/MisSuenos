# 📋 Plano de Execução em Tickets: Trilha de Auditoria Visual & Backup Cloudflare R2 (Fase 2)

**Especificação de Referência:** [SPEC_AUDITORIA_BACKUP.md](file:///d:/projetos-agy/clientes/MisSuenos/SPEC_AUDITORIA_BACKUP.md)  
**Projeto:** Mis Sueños ERP v2.0 (`d:\projetos-agy\clientes\MisSuenos`)  
**Data:** 13/11/2026  
**Autor:** Gustavo Rosa Informática  
**Metodologia:** Fluxo de Engenharia / TDD  

---

### Ticket 1: Evolução do Schema e Helper Central de Auditoria (`lib/audit.js`)
- **Objetivo:** Adequar a tabela `logs_auditoria` para armazenar metadados ricos (módulo, operador, referência, diffs JSON) e criar o módulo `lib/audit.js` com sanitização Zero-PII automática.
- **Arquivos Envolvidos:**
  - `lib/db.js`
  - `lib/audit.js` (novo)
  - `scripts/migrar_schema_auditoria.js` (novo script de migração idempotente)
- **Ações a Executar:**
  1. Atualizar o DDL em `lib/db.js` para garantir as colunas: `usuario_id`, `usuario_nome`, `modulo`, `tipo_acao`, `referencia_id`, `descricao`, `dados_anteriores`, `dados_novos`, `ip_origem`, `user_agent`, `data_hora`.
  2. Criar `lib/audit.js` exportando a função `registrarLog({ ... })` que grava de forma assíncrona, não bloqueante e com mascaramento preventivo de documentos/PII.
  3. Criar `scripts/migrar_schema_auditoria.js` aplicando `ALTER TABLE` condicional nas bases SQLite local e Turso Cloud.
- **Passo de Validação:**
  - Executar `node scripts/migrar_schema_auditoria.js` e validar criação dos índices e colunas sem erros.
- **Status:** [ ] Pendente

---

### Ticket 2: Instrumentação de Auditoria nos Módulos Críticos
- **Objetivo:** Disparar o registro de log estruturado sempre que houver criação, alteração ou cancelamento nos módulos operacionais do ERP.
- **Arquivos Envolvidos:**
  - `api/pedidos.js` (mudanças de status no funil de 6 etapas, novos pedidos e cancelamentos)
  - `api/clientes.js` (novos cadastros, edições de endereço/documento e exclusões)
  - `api/estoque.js` (movimentações manuais, perdas, descarte e ajustes)
  - `api/financeiro.js` (baixas manuais de títulos e estornos)
- **Ações a Executar:**
  1. Importar `registrarLog` em cada módulo.
  2. Capturar o estado anterior (`dados_anteriores`) e o novo estado (`dados_novos`) para compor o diff das alterações.
  3. Registrar o identificador do operador autenticado ou fallback `SISTEMA`.
- **Passo de Validação:**
  - Executar mutações de teste e consultar `SELECT * FROM logs_auditoria ORDER BY id DESC LIMIT 5`, confirmando que os payloads foram gravados corretamente.
- **Status:** [ ] Pendente

---

### Ticket 3: API REST de Consulta de Logs com Paginação e Filtros (`api/logs.js`)
- **Objetivo:** Expandir o endpoint de auditoria para fornecer busca avançada e paginação para o frontend.
- **Arquivos Envolvidos:**
  - `api/logs.js`
  - `api/index.js` (manutenção do Dispatcher único)
- **Ações a Executar:**
  1. Atualizar `api/logs.js` para aceitar query parameters: `modulo`, `tipo_acao`, `usuario_id`, `data_inicio`, `data_fim`, `busca`, `page` e `limit`.
  2. Implementar busca textual com normalização sem acentos em `descricao` e `referencia_id`.
  3. Retornar estrutura padronizada `{ logs: [...], total, page, totalPages }`.
- **Passo de Validação:**
  - Fazer requisição GET `/api/logs?modulo=PEDIDOS&limit=10` e checar resposta HTTP 200 com array e totalizadores corretos.
- **Status:** [ ] Pendente

---

### Ticket 4: Mecanismo de Snapshot Atômico do Banco e Upload para Cloudflare R2
- **Objetivo:** Implementar o fluxo de backup compactado do banco de dados para o storage R2 com retenção e presigned URLs.
- **Arquivos Envolvidos:**
  - `lib/storage.js`
  - `api/sistema.js`
  - `api/index.js`
- **Ações a Executar:**
  1. Criar função `gerarSnapshotBanco()` que executa `VACUUM INTO` do SQLite em arquivo temporário seguro (ou dump de tabelas ativas).
  2. Compactar o arquivo gerado via `zlib.gzip`.
  3. Fazer upload para a pasta `backups/` no Cloudflare R2 com chave formatada `backups/backup_missuenos_YYYY-MM-DD_HHmmss.sqlite.gz`.
  4. Adicionar endpoints em `api/sistema.js`:
     - `POST /api/sistema/backup`: dispara o backup sob demanda.
     - `GET /api/sistema/backups`: lista os últimos 30 backups armazenados no R2 com link de download assinado.
- **Passo de Validação:**
  - Disparar o backup via teste ou chamada HTTP e verificar a existência do arquivo `.sqlite.gz` gerado com tamanho consistente.
- **Status:** [ ] Pendente

---

### Ticket 5: Script CLI para Rotina Noturna Agendada (`scripts/executar_backup_r2.js`)
- **Objetivo:** Fornecer um script standalone que possa ser agendado no Windows Task Scheduler ou rodar como cron noturno.
- **Arquivos Envolvidos:**
  - `scripts/executar_backup_r2.js` (novo)
  - `package.json`
- **Ações a Executar:**
  1. Criar o script autônomo conectando nas variáveis do `.env`/Infisical.
  2. Implementar expurgo automático no R2 de backups com data superior a 30 dias (política de retenção rotativa).
  3. Adicionar atalho no `package.json`: `"backup:r2": "node scripts/executar_backup_r2.js"`.
- **Passo de Validação:**
  - Executar `npm run backup:r2` no terminal PowerShell e verificar saída com log verde de sucesso.
- **Status:** [ ] Pendente

---

### Ticket 6: Interface Visual de Auditoria e Painel de Backups (`public/index.html`)
- **Objetivo:** Disponibilizar o modal `#modal-auditoria-sistema` integrado ao menu do sistema com as abas de Trilha de Auditoria e Central de Backups.
- **Arquivos Envolvidos:**
  - `public/index.html`
  - `public/mobile.css`
- **Ações a Executar:**
  1. Criar o modal `#modal-auditoria-sistema` com abas:
     - **Aba 1 (Trilha de Atividades):** Filtros rápidos em caixa alta, tabela/cards com badge por módulo e botão para inspecionar diff JSON (Antes vs. Depois).
     - **Aba 2 (Backups do Sistema):** Botão *"Gerar Backup Agora"* com spinner de progresso, lista de snapshots com tamanho e botão de download.
  2. Aplicar padrões de UI/UX obrigatórios:
     - Caixa Alta Universal (`text-transform: uppercase`).
     - Ergonomia de Teclado (Tab circula estritamente nos filtros, `tabindex="-1"` em botões secundários).
     - Foco automático no primeiro campo ao abrir o modal (`setTimeout(..., 50)`).
     - Responsividade mobile (ajuste em viewports <= 768px via `mobile.css`).
- **Passo de Validação:**
  - Abrir o modal no navegador, testar filtros, visualização do diff e disparo do backup via interface.
- **Status:** [ ] Pendente

---

### Ticket 7: Suíte Completa de Testes Automatizados TDD (`tests/auditoria_backup.test.js`)
- **Objetivo:** Blindar todo o novo módulo com testes automatizados executados pelo runner nativo do Node.js.
- **Arquivos Envolvidos:**
  - `tests/auditoria_backup.test.js` (novo)
- **Ações a Executar:**
  1. Testar o helper `registrarLog()` (persistência, sanitização Zero-PII, campos obrigatórios).
  2. Testar o endpoint `GET /api/logs` (paginação, filtros por módulo, data e busca textual).
  3. Testar a geração e compactação do backup (`.sqlite.gz`).
  4. Testar a listagem de backups e tolerância a falhas quando o R2 estiver ausente (fallback local).
- **Passo de Validação:**
  - Rodar `npm test` e verificar se a suíte completa passa com 100% de sucesso (somando aos 139 testes atuais).
- **Status:** [ ] Pendente

---

### Ticket 8: Sincronização e Auditoria de Deploy em Produção
- **Objetivo:** Concluir a entrega com commit formal, push para `main`, validação de build na nuvem e verificação de melhorias universais para o `erp-base`.
- **Arquivos Envolvidos:**
  - Git / GitHub / Vercel
- **Ações a Executar:**
  1. Executar `git add` e commit semântico.
  2. Push para `origin main`.
  3. Auditar o status do build na Vercel.
  4. Consultar o usuário Gustavo sobre a propagação das melhorias neutras para o `erp-base`.
- **Passo de Validação:**
  - Aplicação ativa e validada no ambiente de produção.
- **Status:** [ ] Pendente
