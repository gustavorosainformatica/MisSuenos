# 🚀 Guia de Implantação: Turso Cloud + Vercel
**Projeto:** Mis Sueños - Painel de Clientes & Central Fiscal  
**Desenvolvido por:** Gustavo Rosa Informática  

---

## 📌 Visão Geral da Arquitetura
Esta arquitetura foi projetada para ter **CUSTO ZERO (100% Gratuito)**, alta velocidade e tolerância a falhas:
1. **Turso Cloud (Banco de Dados):**
   - SQLite Serverless na Nuvem distribuído globalmente com replicação de baixíssima latência.
   - Plano Gratuito: 9 GB de armazenamento, até 500 bancos de dados e 1 bilhão de leituras/mês.
2. **Vercel (Hospedagem & Backend Serverless):**
   - Roda a interface web moderna (HTML/CSS/JS) e as APIs REST Serverless (`/api/clientes`, `/api/logs`, `/api/nfe`).
   - Certificado SSL/HTTPS automático e gratuito, CDN mundial e deploy contínuo via GitHub.
3. **Fallback Offline Inteligente:**
   - Se o projeto for aberto sem internet ou sem as chaves do Turso, ele roda localmente com o SQLite nativo (`database/clientes.db`) ou o arquivo de dados estáticos (`dados_clientes.js`).

---

## 🛠️ Passo 1: Criar o Banco de Dados no Turso Cloud (2 Minutos)

### Opção A: Pelo Terminal do Windows (PowerShell)
1. Instale o CLI oficial do Turso (se ainda não tiver):
   ```powershell
   irm https://turso.tech/install.ps1 | iex
   ```
2. Faça login com sua conta do GitHub ou e-mail:
   ```bash
   turso auth signup
   # ou se já tiver conta:
   turso auth login
   ```
3. Crie o banco de dados do projeto:
   ```bash
   turso db create missuenos-db --location gru
   ```
   *(A região `gru` fica em São Paulo/Brasil para latência mínima de ~10ms)*.

4. Obtenha a URL de conexão do seu banco:
   ```bash
   turso db show missuenos-db --url
   ```
   *(Exemplo: `libsql://missuenos-db-seuusuario.turso.io`)*

5. Gere o Token de Autenticação seguro:
   ```bash
   turso db tokens create missuenos-db
   ```
   *(Copie a chave gerada)*.

### Opção B: Pelo Navegador (Sem Instalar Nada)
1. Acesse: **[turso.tech](https://turso.tech/)** e entre com sua conta do GitHub.
2. Clique em **"Create Database"** -> Nome: `missuenos-db` -> Localização: `São Paulo (gru)`.
3. Na aba **Connect**, copie a **Database URL** e gere um **Auth Token**.

---

## 📦 Passo 2: Migrar a Base Local para o Turso Cloud (1 Comando)

1. No seu computador, dentro da pasta do projeto `MisSuenos`, crie ou edite o arquivo `.env`:
   ```ini
   TURSO_DATABASE_URL="libsql://missuenos-db-seuusuario.turso.io"
   TURSO_AUTH_TOKEN="seu_token_jwt_gerado"
   ```
2. Execute o script de migração que preparamos:
   ```bash
   node scripts/migrar_turso.js
   ```
3. O script criará as tabelas automaticamente e enviará os 1.140 clientes em lotes de 100 registros com barra de progresso em tempo real!

---

## 🌐 Passo 3: Hospedar na Vercel (Gratuito)

### Pelo Site da Vercel (Recomendado via GitHub)
1. Suba este projeto para um repositório no seu GitHub (pode ser público ou privado).
2. Acesse: **[vercel.com](https://vercel.com/)** e faça login com seu GitHub.
3. Clique em **"Add New..."** -> **"Project"** -> Selecione o repositório `MisSuenos`.
4. Na tela de configuração de ambiente (**Environment Variables**), adicione as duas variáveis:
   - **`TURSO_DATABASE_URL`**: `libsql://missuenos-db-seuusuario.turso.io`
   - **`TURSO_AUTH_TOKEN`**: `seu_token_aqui`
5. Clique em **"Deploy"**.
6. Em menos de 45 segundos seu sistema estará online com link seguro (ex: `https://missuenos.vercel.app`)!

### Ou Pelo Terminal (Vercel CLI)
```bash
npm install -g vercel
vercel
```

---

## 🧾 Como Funciona a Emissão de Notas Fiscais no Sistema

O sistema conta com um módulo unificado e explicativo:
1. **NFS-e de Serviços (Portal Nacional da Receita Federal):**
   - Utilizado para serviços de informática (suporte técnico, manutenção de computadores, consultoria, desenvolvimento de software).
   - Não depende mais de prefeitura municipal! É emitida diretamente pelo Portal Nacional da Receita Federal ([nfse.gov.br](https://www.nfse.gov.br/EmissorNacional/)).
   - O sistema gera a DPS (Declaração de Prestação de Serviços) com CPF/CNPJ do tomador e discriminação do serviço, pronta para importação ou preenchimento rápido.
2. **NF-e de Produtos (SEFAZ - Modelo 55):**
   - Utilizada para venda de produtos físicos, peças e hardware.
   - O sistema exporta o arquivo `.txt` padrão aceito pelo Emissor Gratuito da SEFAZ e do Sebrae.
3. **Auditoria no Banco:**
   - Toda simulação ou emissão de nota gera automaticamente um registro na tabela `logs_auditoria` do banco de dados (no Turso Cloud ou SQLite local), permitindo total rastreabilidade.
