# 🪵 Mis Sueños ERP — Selaria, Couros & Peles (v2.0)

> Sistema Integrado de Gestão Empresarial (ERP) moderno, serverless e mobile-first, desenvolvido sob medida para a **Mis Sueños Couros & Peles** com arquitetura neutra e escalável.

---

## 🧭 Visão Geral do Sistema

O **Mis Sueños ERP v2.0** unifica toda a cadeia operacional da empresa em uma única plataforma de alta performance: da gestão da carteira de clientes à expedição física de galpão, controle analítico de estoque com Ficha Kardex, faturamento fiscal (NF-e/NFS-e), fluxo de caixa, DRE e conciliação bancária de extratos em lote.

### 🌟 Diferenciais de Engenharia
- **⚡ Arquitetura Serverless Unificada:** Dispatcher central único (`api/index.js`) que consome apenas **1 Serverless Function na Vercel Hobby** (blindagem estrita do teto de 12 funções).
- **🗄️ Banco de Dados Híbrido & Distribuído:** SQLite local nativo (`node:sqlite`) para desenvolvimento ágil e **Turso Cloud** (`libSQL`) para produção distribuída com latência ultra-baixa.
- **📱 PWA Mobile-First (v59):** Experiência nativa em smartphones (<= 768px) com Bottom Navigation Bar de 5 abas, toque ergonômico de 44px+ e suporte a gestos e histórico (`popstate`).
- **🖥️ Ergonomia Desktop Avançada:** Barra lateral com redimensionamento fluido por arraste (200px a 500px), navegação por teclado sem fricção (Tab contínuo), comboboxes inteligentes e foco automático em modais.
- **🛡️ Blindagem Zero-PII & Segurança:** Isolamento estrito de dados sensíveis, credenciais via **Infisical**, autenticação multi-operador com hash HMAC-SHA256 e trilha de auditoria.
- **🧪 100% Testado (TDD):** Cobertura com **139 testes automatizados** passando em ~3 segundos via `node:test`.

---

## 📦 Módulos do Sistema

### 1. 👥 Clientes & CRM Territorial
- **Base de 1.140 clientes reais** com busca instantânea por nome, CPF/CNPJ, cidade, UF e apelido comercial sem acentuação (`normalizarTextoBusca`).
- **Mapa de Calor SVG do Brasil:** Visualização da concentração territorial por estado (liderança RS com 693 clientes, SP, PR, SC, etc.).
- **Blindagem Cadastral Completa:**
  - Validação matemática estrita de **CPF e CNPJ via Módulo 11 da Receita Federal** com máscara progressiva dinâmica e bloqueio físico de letras.
  - **CEP Inteligente (ViaCEP):** Busca automática ao digitar o 8º dígito, preenchendo logradouro em caixa alta e direcionando o foco automaticamente para o campo *Número* (ou *Logradouro* em municípios com CEP único).
  - **Telefone com Máscara Autoajustável:** Alternância instantânea entre fixo `(00) 0000-0000` e celular `(00) 00000-0000`, validação de DDD e atalho direto de 1 clique para conversa no WhatsApp.
- Exportação instantânea em formatos **CSV (Excel UTF-8-BOM)** e **JSON**.

### 2. 📦 Vendas, Pedidos & Funil Físico de Galpão
Ciclo de vida logístico e comercial estritamente alinhado à rotina do galpão de couros:
1. `AGUARDANDO_PAGAMENTO` (💳): Reserva imediata no estoque sem liberar para embalagem. Título financeiro `PENDENTE`. Padrão ao abrir novo pedido.
2. `EM_SEPARACAO` (📦): Pagamento confirmado. Picking & packing nas prateleiras e embalagem com etiqueta.
3. `AGUARDANDO_ENVIO` (⏳): Pacote fechado, pesado e etiquetado na baia de saída aguardando coleta/despacho.
4. `ENVIADO` (🚚): Postado com código de rastreamento ativo e baixa definitiva no estoque físico.
5. `ENTREGUE` (✅): Concluído com sucesso no destino final.
6. `CANCELADO` (❌): Estorno automático de reserva de estoque e cancelamento dos títulos financeiros pendentes.
- **Numeração Comercial Blindada:** Cálculo do `#PED-XXXX` extraído numericamente dos registros reais com proteção dupla no backend para prevenir erros de restrição `UNIQUE`.

### 3. 🪵 Estoque Inteligente & Ficha Kardex
- **Conceito de 3 Saldos Simultâneos:**
  - **Saldo Físico:** Quantidade real existente nas prateleiras do galpão.
  - **Saldo Reservado:** Quantidade alocada em pedidos ativos aguardando separação/envio.
  - **Saldo Disponível:** Quantidade livre para novas vendas (`Físico - Reservado`).
- **Catálogo com NCM Oficial:** 40 produtos cadastrados com classificação fiscal de couros, peles e selaria.
- **Ficha Kardex (`estoque_movimentacoes`):** Histórico completo e rastreável de todas as movimentações (Entradas, Saídas, Ajustes, Vendas de Pedidos e Devoluções), com justificativa obrigatória e bloqueio atômico de saídas sem saldo suficiente.

### 4. 💰 Módulo Financeiro, Fluxo de Caixa & DRE
- **Contas a Receber:** Gerado de forma 100% automática a partir do faturamento de pedidos de venda.
- **Contas a Pagar:** Lançamentos avulsos e recorrentes de despesas operacionais.
- **Projeção de Fluxo de Caixa:** Visão temporal de 30 dias com cálculo analítico de saldo diário acumulado e detecção preventiva de estouro de caixa.
- **DRE Gerencial:** Apuração de Resultado do Exercício com Receita Bruta, Deduções, Custo de Mercadorias Vendidas (CMV), Margem Bruta e Lucro Líquido.

### 5. 🏦 Conciliação Bancária de Extratos (OFX & CSV)
- Importação em lote de extratos bancários nos formatos **OFX (SGML/XML)** e **CSV**.
- **Motor Heurístico de Pareamento:** Atribuição de score (1.0 para valor/data exatos, 0.8 para datas próximas, 0.5 para divergência de centavos).
- Conciliação e baixa em lote com registro automático de taxas bancárias em transação atômica.

### 6. 🛒 Compras, Fornecedores & Importador de XML de NF-e
- Cadastro estruturado de fornecedores.
- **Parser de XML de NF-e:** Leitura direta de chaves `<emit>`, `<det><prod>` e `<cobr><dup>`.
- **Modo de Entrada Híbrido (A/B):**
  - **Opção A:** Apenas despesa financeira (para insumos ou despesas operacionais sem estoque).
  - **Opção B:** Entrada física no estoque com recálculo do custo médio ponderado e inclusão das duplicatas no Contas a Pagar.

### 7. 🚚 Logística, Cotação Multi-Frete & Etiquetas
- **Cotação Concorrente em Tempo Real:** Consulta simultânea e resiliente entre transportadoras (**SuperFrete**, **Correios CWS**, **Melhor Envio** e **Frenet**), com cache em memória por CEP para respostas instantâneas.
- **Identificação Inteligente:** Destaque visual automático para as opções de **Menor Preço** e **Mais Rápido**.
- **Impressão de Etiquetas de Envio:**
  - Formato **Térmica 100x150 mm** e **Folha A4** com linhas de corte limpas (`@media print`).
  - Código de barras do CEP em vetor nítido SVG Code 39.
  - Botão de 1 clique para exportar dados para a plataforma SuperFrete e atalho direto para WhatsApp do destinatário.

### 8. 🧾 Central Fiscal Integrada
- **NF-e Modelo 55 (Produtos / Mercadorias):**
  - Geração de Chave de Acesso Oficial de 44 dígitos com Dígito Verificador Módulo 11 da SEFAZ.
  - Template de **DANFE em HTML limpo** para visualização e impressão direta.
  - Download de XML oficial com headers apropriados.
  - Integração com conector fiscal **WLG Sistemas**.
- **NFS-e de Serviços:** Declaração de Prestação de Serviços (DPS) no Padrão Nacional da Receita Federal.

### 9. 🎨 Motor White-Label & RBAC
- **Configuração em Dupla Camada:**
  - **Camada 1 (Setup de Código):** Wizard de terminal `npm run configurar-ramo` com presets de nicho (*Selaria*, *Informática*, *Comércio*, *Oficina*).
  - **Camada 2 (Dinâmica):** Painel de personalização no frontend gravado na tabela `configuracoes_sistema` do banco de dados (sem hardcoding).
- **Controle de Acesso por Operador (RBAC):** Senhas com hash criptográfico HMAC-SHA256 e permissões granulares por módulo.

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia | Descrição |
| :--- | :--- | :--- |
| **Ambiente de Execução** | Node.js (ESM) | Módulos ECMAScript modernos (`"type": "module"`). |
| **Banco de Dados Local** | `node:sqlite` / SQLite 3 | Banco nativo sem dependências C++ externas, ultra-rápido. |
| **Banco de Dados Nuvem** | Turso Cloud (`@libsql/client`) | SQLite distribuído na Edge com replicação mundial. |
| **Armazenamento de Arquivos** | Cloudflare R2 (`@aws-sdk/client-s3`) | Storage compatível com S3 para comprovantes e XMLs. |
| **Hospedagem & Deploy** | Vercel (Edge & Serverless) | Dispatcher único (`api/index.js`) consumindo 1 função. |
| **Segredos & Env** | Infisical & `dotenv` | Gestão centralizada de variáveis sem vazar chaves no Git. |
| **Testes Automatizados** | `node:test` nativo | Suíte com 139 testes sem necessidade de frameworks pesados. |

---

## 📂 Estrutura do Projeto

```
MisSuenos/
├── api/                           # Camada Backend & Serverless
│   ├── index.js                   # 🚀 Dispatcher Central Único (Vercel Hobby)
│   ├── clientes.js                # API REST de Clientes & CRM
│   ├── pedidos.js                 # API de Pedidos & Funil de Vendas
│   ├── produtos.js                # API de Catálogo & NCM
│   ├── estoque.js                 # API de Movimentação & Kardex
│   ├── financeiro.js              # API de Contas a Pagar/Receber & Caixa
│   ├── compras.js                 # API de Compras & Parser XML NF-e
│   ├── logistica.js               # API de Cotação Multi-Frete & Etiquetas
│   ├── nfe.js                     # API Fiscal (NF-e 55, DANFE, NFS-e)
│   ├── auth.js                    # API de Autenticação & PIN de Operadores
│   └── configuracoes.js           # API de Configurações & White-Label
│
├── database/                      # Schemas e Bancos Locais
│   ├── schema.sql                 # DDL completo das tabelas do ERP
│   └── clientes.db                # Banco SQLite local
│
├── lib/                           # Módulos de Domínio e Conectores
│   ├── db.js                      # Conexão híbrida (SQLite local vs Turso Cloud)
│   ├── calculos_erp.js            # Regras financeiras, frete, margem e DRE
│   ├── logistica_hub.js           # Hub multi-transportadora (SuperFrete, Correios, etc.)
│   ├── fiscal_hub.js              # Geração de chave 44 dígitos, DANFE e XML
│   └── conciliacao_motor.js       # Parser OFX/CSV e motor de score
│
├── public/                        # Frontend PWA & Aplicação Web
│   ├── index.html                 # SPA Principal do ERP (Clientes, Pedidos, Estoque, etc.)
│   ├── mobile.css                 # Folha de estilos responsiva Mobile-First (v59)
│   ├── erp_preview.html           # Visualizador com sidebar redimensionável
│   └── sw.js                      # Service Worker para funcionamento offline PWA
│
├── scripts/                       # Ferramentas CLI & Migrações
│   ├── servidor_web.js            # Servidor HTTP local para desenvolvimento (porta 3000)
│   ├── migrar_schema_v2.js        # Script de migração do schema v2
│   ├── migrar_schema_estoque.js   # Migração da tabela estoque_movimentacoes (Kardex)
│   ├── migrar_turso.js            # Sincronização em lotes para o Turso Cloud
│   ├── importar_ncm.js            # Importação do catálogo oficial de NCMs
│   ├── configurar_ramo.js         # Wizard interativo de configuração White-Label
│   └── promover_producao.js       # Script de auditoria e validação de deploy
│
├── tests/                         # Suíte de Testes Automatizados (139 testes)
│   ├── calculos.test.js           # Validação matemática de totais, fretes e margens
│   ├── clientes_api.test.js       # Testes da API de Clientes e integridade de dados
│   ├── pedidos.test.js            # Ciclo de vida de pedidos e reserva de estoque
│   ├── estoque_kardex.test.js     # Regras de movimentação, bloqueio e Ficha Kardex
│   ├── dre_fluxo_caixa.test.js    # DRE analítica e projeção de caixa
│   ├── suprimentos_fiscal.test.js # Cotação multi-frete, conciliação e emissão NF-e
│   ├── mobile_first.test.js       # Validação das regras de responsividade mobile
│   └── validacoes.test.js         # Módulo 11 (CPF/CNPJ), CEP, telefones e caixa alta
│
├── vercel.json                    # Configuração de rotas e build da Vercel
└── package.json                   # Dependências e scripts npm
```

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
- **Node.js** >= 18.x
- **Git**

### 1. Instalação de Dependências
```bash
git clone https://github.com/gustavorosainformatica/MisSuenos.git
cd MisSuenos
npm install
```

### 2. Executando a Suíte de Testes
```bash
npm test
```
*Executa todos os 139 testes de integração e unitários via runner nativo do Node.js.*

### 3. Iniciando o Servidor Local de Desenvolvimento
```bash
npm run web
```
Acesse no navegador: **[http://localhost:3000](http://localhost:3000)**

Para carregar automaticamente as variáveis de ambiente gerenciadas no Infisical:
```bash
npm run web:infisical
```

### 4. Consultas Rápidas via Terminal (CLI)
```bash
# Resumo geral da base de clientes
npm run consultar

# Busca específica por nome, cidade ou documento
npm run consultar -- "Porto Alegre"
npm run consultar -- "Pele Caprina"
```

### 5. Wizard de Personalização de Ramo (White-Label)
```bash
npm run configurar-ramo
```

---

## ☁️ Deploy em Produção (Vercel + Turso Cloud)

O deploy é automatizado com **Custo Zero** via Vercel e Turso:

1. **Configuração de Variáveis de Ambiente na Vercel:**
   - `TURSO_DATABASE_URL`: URL do banco no Turso (`libsql://missuenos-...turso.io`)
   - `TURSO_AUTH_TOKEN`: Token de autenticação seguro do Turso
   - `INFISICAL_TOKEN` (opcional): Para sincronização dinâmica de segredos
2. **Deploy Automático:**
   - Cada `git push origin main` aciona o build da Vercel automaticamente.
   - O frontend estático é publicado na CDN mundial e o backend é servido via Serverless Function única (`api/index.js`).
3. **Migração de Dados para a Nuvem:**
   ```bash
   npm run migrar:turso
   ```

---

## 📄 Governança e Diretrizes

Este projeto segue a **Governança Global Nível 1** do ecossistema de desenvolvimento do Gustavo:
- **Zero-PII Estrito:** Dados sensíveis reais nunca são commitados no repositório. Dados de mock e seeds são 100% sintéticos.
- **PT-BR Obrigatório:** Documentação, interface e mensagens técnicas em Português do Brasil.
- **Padrão Caixa Alta:** Entradas de dados e registros normalizados em uppercase (`text-transform: uppercase`).
- **Isolamento de Clientes (Nível 3):** As regras específicas da Mis Sueños residem exclusivamente neste repositório, mantendo o `erp-base` universal e neutro.

---

**Desenvolvido com excelência técnica por Gustavo Rosa Informática** 🚀
