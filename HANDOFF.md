# Registro de Transição de Contexto (Handoff)

**Data / Hora:** 29/10/2026 às 15:58 (Horário de Brasília)  
**Projeto:** ERP MisSuenos (Clientes, Vendas e Logística)  
**Objetivo da Sessão:** Análise técnica comparativa e planejamento de arquitetura para integração de emissor gratuito de notas fiscais (NF-e Modelo 55) diretamente no ERP MisSuenos.

---

## 1. O que foi Concluído
- **Análise Comparativa de Soluções Fiscais Gratuitas:**
  - `tiranota.com.br`: Plataforma SaaS da *Organisys* (mesmo grupo do Bling). Focada em digitação manual em painel web; **descartada** por não oferecer API REST pública e gratuita para integração programática com ERPs terceiros.
  - `wlgsistemas.com.br`: **Aprovada e selecionada**. Disponibiliza API Fiscal REST gratuita oficial (`fiscal.wlgsistemas.com.br/api/v1`), autenticação OAuth2/JWT Bearer, documentação Swagger interativa, suporte a NF-e (Modelo 55) e NFC-e (Modelo 65), processamento assíncrono com `operationId`, e download direto de DANFE (PDF) e XML autorizado.
- **Detalhamento do Tripé Fiscal SEFAZ/RS:**
  - **Dados do Emitente:** Razão Social, CNPJ, Inscrição Estadual (IE ativa no RS), Código IBGE do município (`4314902` - Novo Hamburgo), CRT (Simples Nacional/MEI) e upload do Certificado Digital A1 no painel da WLG.
  - **NCM (Nomenclatura Comum do Mercosul):** Código de 8 dígitos obrigatório por item (produtos de couro e peles enquadrados nos Capítulos 41 e 42 da NCM).
  - **CFOP (Código Fiscal de Operações):** Definição da regra de negócio automática:
    - `5102`: Venda interna dentro do Rio Grande do Sul (RS -> RS).
    - `6102`: Venda interestadual (RS -> demais estados).
    - Lógica implementada via código sem sobrecarregar o operador com seleção manual.

---

## 2. Arquivos Modificados / Criados
- `HANDOFF.md` - Documento de transferência de contexto gerado na raiz do projeto para assegurar a continuidade técnica sem perda de histórico.

---

## 3. Estado Atual e Decisões Críticas
- **Provedor Homologado:** WLG Sistemas (`fiscal.wlgsistemas.com.br`).
- **Segurança e Variáveis de Ambiente:** As credenciais `WLG_CLIENT_ID` e `WLG_CLIENT_SECRET` serão centralizadas e injetadas pelo **Infisical**, mantendo o padrão seguro do projeto.
- **Backend MisSuenos:** A integração será acoplada ao servidor Node.js (`scripts/servidor_web.js`), reaproveitando o fluxo da rota `/api/nfe` ou criando módulo isolado em `lib/wlg.js`.
- **Armazenamento de Notas:** Os XMLs autorizados e DANFEs em PDF retornados pela API poderão ser persistidos tanto no banco local (SQLite/Turso) quanto no storage de anexos existente (Cloudflare R2).

---

## 4. Próximos Passos Imediatos
- [ ] **Ação Administrativa:** Criar conta gratuita na [WLG Sistemas](https://wlgsistemas.com.br) para a empresa Mis Sueños.
- [ ] **Ação Administrativa:** Fazer o upload do Certificado Digital A1 (`.pfx`) e preencher os dados cadastrais da empresa no painel da WLG.
- [ ] **Ação Administrativa:** Gerar as credenciais da API (`ClientId` e `ClientSecret`) no portal da WLG.
- [ ] **Configuração SecretOps:** Inserir `WLG_CLIENT_ID` e `WLG_CLIENT_SECRET` no Infisical.
- [ ] **Banco de Dados:** Garantir que a tabela `produtos` contenha a coluna `ncm` preenchida para cada produto ativo.
- [ ] **Desenvolvimento Backend:** Implementar o cliente HTTP Node.js para autenticação (`/api/v1/auth/token`) e disparo de notas (`/api/v1/nfe`) inicialmente em ambiente de homologação (`tipoAmbiente: 2`).

---

## 5. Cuidados e Observações Técnicas
- **Certificado Digital A1 Obrigatório:** O certificado deve ser obrigatoriamente do modelo A1 (arquivo `.pfx`). Dispositivos A3 (token USB/smartcard físico) são incompatíveis com automação em nuvem via API.
- **Ambiente de Homologação Primeiro:** Todo o desenvolvimento e validação dos primeiros disparos devem obrigatoriamente rodar com `tipoAmbiente = 2` (Homologação / Sem valor fiscal) até que a estrutura dos dados esteja 100% validada pela SEFAZ/RS.

