# Plano de Execução em Tickets: Armazenamento, Quotas & Cold Storage R2

- **Origem:** Especificação Técnica (`SPEC-armazenamento-quotas-r2.md`)
- **Metodologia:** Fluxo de Engenharia de Matt Pocock (`/to-tickets`)
- **Status:** Aguardando Aprovação para Execução com `/implement-spec`

---

### Ticket 1: Telemetria de Armazenamento no Backend (`GET /api/sistema/armazenamento`)
- **Objetivo:** Criar o endpoint de telemetria que calcula o uso real de bytes do banco de dados (Turso libSQL e SQLite local), contagem de anexos no Cloudflare R2 e distribuição por tabela.
- **Arquivos Envolvidos:**
  - `scripts/servidor_web.js` (ambiente de desenvolvimento local port 3002)
  - `api/sistema_armazenamento.js` (serverless function para produção Vercel)
- **Ações a Executar:**
  1. Implementar consulta via `PRAGMA page_count` e `PRAGMA page_size` para calcular o tamanho real de dados e páginas livres do SQLite / Turso.
  2. Implementar medição do arquivo físico `database/clientes.db` e varredura da pasta de uploads / bucket R2.
  3. Contar registros das tabelas principais (`clientes`, `pedidos`, `logs_auditoria`, `anexos_metadata`, `produtos_estoque`) e estimar percentuais.
  4. Retornar estrutura JSON padronizada com limites do plano gratuito (9.0 GB para Turso e 10.0 GB para R2).
- **Passo de Validação:**
  - Executar requisição HTTP `GET http://localhost:3002/api/sistema/armazenamento` e verificar resposta `200 OK` com todos os campos de métricas preenchidos.
- **Status:** [ ] Pendente

---

### Ticket 2: Rotinas de Manutenção: VACUUM e Cold Storage no Cloudflare R2
- **Objetivo:** Criar os endpoints de ação para otimização com `VACUUM` e expurgo de logs com mais de 90 dias com upload automático para o Cloudflare R2 antes da exclusão.
- **Arquivos Envolvidos:**
  - `scripts/servidor_web.js`
  - `api/sistema_manutencao.js`
  - `lib/storage.js`
- **Ações a Executar:**
  1. Criar rota `POST /api/sistema/otimizar` que executa o comando `VACUUM` no banco ativo para desfragmentar páginas e encolher o arquivo físico.
  2. Criar rota `POST /api/sistema/limpar-logs` que:
     - Coleta os registros de `logs_auditoria` com mais de 90 dias.
     - Gera arquivo formatado `.csv` com codificação UTF-8 com BOM.
     - Envia para o Cloudflare R2 na pasta `backups/logs/logs_auditoria_ate_YYYY-MM-DD.csv` (com fallback local seguro em `/public/uploads/backups/` se o R2 não estiver configurado).
     - Executa `DELETE FROM logs_auditoria WHERE data < 90 dias`.
     - Executa `VACUUM` para liberar o espaço imediato no Turso.
- **Passo de Validação:**
  - Executar script de teste automatizado invocando os endpoints e verificando a geração do arquivo CSV e o comando VACUUM com sucesso.
- **Status:** [ ] Pendente

---

### Ticket 3: Interface do Painel "Armazenamento & Quotas" no Menu da Engrenagem ⚙️
- **Objetivo:** Adicionar o botão no Menu da Engrenagem ⚙️ e criar o modal responsivo com os gráficos de consumo e tabela de distribuição.
- **Arquivos Envolvidos:**
  - `public/index.html`
- **Ações a Executar:**
  1. Inserir o item *"Armazenamento & Quotas"* com badge de status no dropdown da engrenagem `#erp-gear-dropdown` e no menu lateral gaveta mobile.
  2. Construir o modal `#modal-armazenamento-quotas` com design Dark Glass:
     - Cards de métricas com barras de progresso para Turso (9GB), SQLite Local, R2 Uploads (10GB) e Repositório GitHub.
     - Tabela detalhada de tabelas e registros com botão de atualização em tempo real.
     - Botões de ação direta para *"Otimizar Banco (VACUUM)"* e *"Expurgar Logs Antigos com Cold Storage R2"*.
  3. Garantir comportamento nativo mobile: *Bottom Sheet* com cantos arredondados de 20px e puxador tátil em telas `<= 768px`.
- **Passo de Validação:**
  - Abrir o modal pelo navegador via emulação Desktop (1280x800) e Mobile iPhone 14 Pro (393x852) e verificar layout responsivo.
- **Status:** [ ] Pendente

---

### Ticket 4: Sistema de Alertas Preventivos em Popups (25%, 50% e 75%)
- **Objetivo:** Implementar os popups visuais de alerta automático quando o consumo de qualquer serviço cruzar 25%, 50% ou 75%.
- **Arquivos Envolvidos:**
  - `public/index.html`
- **Ações a Executar:**
  1. Criar a rotina frontend `checarAlertasQuotas(metricas)` executada na inicialização do ERP.
  2. Implementar os 3 níveis visuais de popup:
     - 25%: Informativo Ciano.
     - 50%: Atenção Âmbar.
     - 75%: Alerta Preventivo Laranja/Vermelho com atalho direto de limpeza.
  3. Adicionar controle de anti-fadiga no `localStorage` (`missuenos_quota_alert_dismissed`) para registrar a dispensa e evitar alertas repetitivos a cada clique.
- **Passo de Validação:**
  - Simular o acionamento dos 3 níveis de alerta via console/script e verificar a exibição fluida e o funcionamento do botão "Dispensar".
- **Status:** [ ] Pendente

---

### Ticket 5: Validação Integrada, Sincronização com `erp-base` e Deploy em Produção
- **Objetivo:** Testar todos os fluxos de ponta a ponta com Puppeteer, sincronizar com o template comercial `erp-base`, promover para a branch `main` e validar na produção Vercel.
- **Arquivos Envolvidos:**
  - `D:\projetos-agy\MisSuenos-Dev`
  - `D:\projetos-agy\erp-base`
  - `D:\projetos-agy\MisSuenos`
- **Ações a Executar:**
  1. Executar bateria de testes com Puppeteer cobrindo requisições de telemetria, clique nos botões de manutenção e responsividade mobile.
  2. Fazer commit e push no branch `dev` em `MisSuenos-Dev`.
  3. Sincronizar arquivos com `erp-base` e registrar commit.
  4. Mesclar `origin/dev` em `MisSuenos` (`main`) e fazer push para deploy automático na Vercel (`https://missuenos.vercel.app`).
  5. Verificar em tempo real a produção na URL oficial.
- **Passo de Validação:**
  - Capturar screenshots da produção ao vivo em `https://missuenos.vercel.app` confirmando o funcionamento em celular e desktop.
- **Status:** [ ] Pendente

