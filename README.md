# Mis Sueños - Banco de Dados de Clientes & Endereços de Envio

Sistema automatizado de extração, estruturação e consulta de destinatários e endereços de clientes a partir de arquivos `.docx` da pasta `ENDEREÇOS DE ENVIO`.

---

## 📊 Resumo da Base Gerada

- **Total de Arquivos Analisados:** 1.145 documentos
- **Modelos/Templates em Branco Descartados:** 5 documentos
- **Clientes Cadastrados com Sucesso:** **1.140 clientes**
- **Cobertura de Cidades:** 1.140 (100.0%)
- **Cobertura de UF / Estado:** 1.140 (100.0%)
- **Cobertura de CEP:** 1.136 (99.6%)
- **CPFs Identificados:** 170
- **CNPJs Identificados:** 29
- **Inscrições Estaduais (IE):** 26
- **Telefones / WhatsApp:** 6
- **Lojas / Apelidos Comerciais Mapeados:** 66

### Distribuição por Estado (UF)
- **RS:** 693
- **SP:** 108
- **PR:** 91
- **SC:** 85
- **MG:** 51
- **MS:** 41
- **MT:** 33
- **GO:** 17
- **RO:** 11
- **PA:** 5
- **BA:** 2
- **AP:** 1
- **CE:** 1
- **TO:** 1

---

## 🗄️ Arquivos do Banco de Dados Gerados

Todos os arquivos estão disponíveis no diretório [`database/`](file:///d:/projetos-agy/gustavorosainformatica/MisSuenos/database/):

| Arquivo | Formato | Tamanho | Descrição |
|---|---|---|---|
| [`database/clientes.db`](file:///d:/projetos-agy/gustavorosainformatica/MisSuenos/database/clientes.db) | **SQLite 3** | ~434 KB | Banco de dados relacional com tabela `clientes` e índices de alta performance. Pronto para integração direta com Node.js, C#, Python, Electron, etc. |
| [`database/clientes.json`](file:///d:/projetos-agy/gustavorosainformatica/MisSuenos/database/clientes.json) | **JSON (UTF-8)** | ~750 KB | Arquivo JSON contendo todos os 1.140 registros completos, pronto para consumo em APIs e frontends. |
| [`database/clientes.csv`](file:///d:/projetos-agy/gustavorosainformatica/MisSuenos/database/clientes.csv) | **CSV (Excel)** | ~220 KB | Planilha delimitada por ponto e vírgula (`;`) com codificação UTF-8-BOM para abertura nativa no Microsoft Excel sem corromper acentos. |

---

## 📑 Estrutura da Tabela `clientes` (SQLite)

```sql
CREATE TABLE clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,             -- Nome do cliente / destinatário
    apelido_referencia TEXT,        -- Apelido ou identificação de loja (ex: "D S COUROS")
    razao_social TEXT,              -- Razão social jurídica se houver
    cpf TEXT,                       -- CPF formatado (000.000.000-00)
    cpf_limpo TEXT,                 -- Apenas os 11 dígitos do CPF para busca rápida
    cnpj TEXT,                      -- CNPJ formatado (00.000.000/0001-00)
    cnpj_limpo TEXT,                -- Apenas os 14 dígitos do CNPJ para busca rápida
    ie TEXT,                        -- Inscrição Estadual (IE)
    telefone TEXT,                  -- Telefone/WhatsApp formatado com DDD
    telefone_limpo TEXT,            -- Apenas dígitos do telefone
    endereco_completo TEXT,         -- Linha de endereço original
    logradouro TEXT,                -- Nome da via (Rua, Av, Rodovia, etc.)
    numero TEXT,                    -- Número predial ou S/N
    complemento TEXT,               -- Complemento (Apto, Bloco, Fazenda, etc.)
    bairro TEXT,                    -- Bairro
    cidade TEXT,                    -- Município
    uf TEXT,                        -- Sigla do Estado (2 letras)
    cep TEXT,                       -- CEP formatado (00000-000)
    cep_limpo TEXT,                 -- Apenas os 8 dígitos do CEP
    observacoes TEXT,               -- Anotações extras contidas no arquivo
    arquivo_origem TEXT UNIQUE,     -- Nome do arquivo .docx original
    data_cadastro TEXT              -- Timestamp da extração
);
```

### Índices Criados:
- `idx_clientes_nome` em `clientes(nome)`
- `idx_clientes_cpf` em `clientes(cpf_limpo)`
- `idx_clientes_cnpj` em `clientes(cnpj_limpo)`
- `idx_clientes_cidade_uf` em `clientes(cidade, uf)`
- `idx_clientes_cep` em `clientes(cep_limpo)`

---

## 🚀 Como Utilizar

### 1. Pesquisa Rápida pelo Terminal (CLI Node.js)

```bash
# Ver resumo geral de clientes e estados
npm run consultar

# Pesquisar por nome de cliente
npm run consultar -- "Marcos"

# Pesquisar por cidade
npm run consultar -- "Porto Alegre"

# Pesquisar por loja / apelido comercial
npm run consultar -- "D S COUROS"

# Pesquisar por CPF, CNPJ ou CEP
npm run consultar -- "27.221.785"
npm run consultar -- "83301"
```

### 2. Painel Web de Clientes & Etiquetas de Envio

Inicie o servidor web local:
```bash
npm run web
```
Depois acesse no navegador: **[http://localhost:3000](http://localhost:3000)**

**Recursos do Painel Web:**
- 🔍 Busca instantânea em tempo real com debounce e filtros de completude
- 🏷️ Filtro por Estado (chips com contagem por UF) e Mapa de Calor do Brasil
- 📦 **Visualizador e Impressão de Etiquetas de Envio:**
  - Layout físico pré-impressão em formato **Térmica (100x150 mm)** ou **Folha A4** com guia de corte
  - Código de barras do CEP em vetor SVG Code 39 nítido para leitores óticos
  - Botão de **Impressão Limpa** (`@media print`) sem poluição de menus
  - **Integração Superfrete:** Botão com 1 clique para copiar os dados formatados para o [Superfrete](https://superfrete.com/app) e atalho direto para a plataforma web
  - Copiador de etiqueta completa para Correios, Jadlog e Melhor Envio
- 📥 Botões de exportação direta em CSV e JSON

### 3. Central Fiscal & Emissão de Notas Fiscais
O sistema conta com um módulo fiscal integrado para prestadores de serviço e venda de produtos:
- **🛠️ NFS-e de Serviços (Portal Nacional da Receita Federal):**
  - Integração com o novo padrão unificado da Receita Federal ([nfse.gov.br](https://www.nfse.gov.br/EmissorNacional/)).
  - Gera a Declaração de Prestação de Serviços (DPS) em formato XML oficial para importação/transmissão.
  - Pré-configurações de serviços de informática (Hardware, Formatação, Redes, Consultoria em TI).
- **📦 NF-e de Produtos / Mercadorias (SEFAZ-RS - Modelo 55):**
  - Exportação em formato `.TXT` compatível com o Emissor Gratuito da SEFAZ e Sebrae.
  - Suporte a NCMs de hardware (SSDs, memórias, fontes, computadores).
- **📜 Logs de Auditoria no Banco:**
  - Todas as emissões e alterações cadastrais ficam registradas na tabela `logs_auditoria` do banco SQLite/Turso.

---

## ☁️ Implantação Gratuita na Nuvem: Turso Cloud + Vercel

O projeto está 100% preparado para rodar na nuvem com **Custo Zero**:

### 1. Migração para o Turso Cloud (SQLite Global Serverless)
1. Crie seu banco gratuito no [turso.tech](https://turso.tech/) ou via CLI:
   ```bash
   turso db create missuenos-db --location gru
   ```
2. Configure seu `.env` com a URL e Auth Token do Turso:
   ```ini
   TURSO_DATABASE_URL="libsql://missuenos-db-seuusuario.turso.io"
   TURSO_AUTH_TOKEN="seu_token_aqui"
   ```
3. Execute o script de migração:
   ```bash
   npm run migrar:turso
   ```
   *Todos os 1.140 clientes e o histórico de auditoria serão sincronizados em lotes para a nuvem.*

### 2. Hospedagem na Vercel
1. Conecte o repositório na [vercel.com](https://vercel.com/).
2. Adicione as variáveis de ambiente `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`.
3. Pronto! A Vercel servirá o frontend estático e as funções serverless (`/api/clientes`, `/api/logs`, `/api/nfe`) com SSL e CDN mundial.

*Consulte o guia completo em [`GUIA_DEPLOY_VERCEL_TURSO.md`](file:///d:/projetos-agy/gustavorosainformatica/MisSuenos/GUIA_DEPLOY_VERCEL_TURSO.md).*

---

### 4. Reexecutar a Conversão Local
Se adicionar novos arquivos `.docx` na pasta `ENDEREÇOS DE ENVIO`, basta executar:
```bash
npm run converter
# ou: python scripts/converter_enderecos.py
```
O banco SQLite, o JSON e o CSV serão atualizados automaticamente!

