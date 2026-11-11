# Regras Específicas do Cliente: `Mis Sueños` (`D:\projetos-agy\clientes\MisSuenos\`) — Nível 3

Este projeto é o sistema ERP dedicado ao cliente **Mis Sueños (Couros, Peles e Artigos de Selaria)**.

## Diretrizes Exclusivas deste Projeto

1. **Ciclo de Vida Logístico Obrigatório (Funil Real de Galpão & E-commerce):**
   - Em todos os módulos de pedidos, vendas e encomendas deste cliente, os campos de seleção (`select`), menus dropdown, filtros e relatórios DEVEM seguir estritamente a ordem física do galpão:
     1. **`AGUARDANDO_PAGAMENTO` (💳 Aguardando Pagamento):** Pedido registrado com reserva imediata no estoque, sem embalar/despachar até confirmação do valor. Título financeiro gerado como `PENDENTE`. Padrão automático ao abrir `+ Novo Pedido`. Renderiza com Badge Dourado Ouro (`#facc15` / `rgba(250, 204, 21, 0.18)`).
     2. **`EM_SEPARACAO` (📦 Em Separação / Picking & Packing):** Pagamento confirmado. Impressão de romaneio, separação nas prateleiras e embalagem com etiqueta.
     3. **`AGUARDANDO_ENVIO` (⏳ Aguardando Envio / Pronto para Coleta):** Pacote fechado, pesado e etiquetado na baia de saída aguardando coleta ou despacho nos Correios/Superfrete.
     4. **`ENVIADO` (🚚 Enviado / Em Trânsito):** Pacote postado/coletado com código de rastreamento ativo e baixa definitiva no estoque.
     5. **`ENTREGUE` (✅ Entregue / Concluído):** Mercadoria entregue ao comprador final.
     6. **`CANCELADO` (❌ Cancelado):** Desistência ou expiração do prazo, com estorno automático da reserva de estoque e cancelamento de títulos pendentes.
   - A função `isStatusPendente` deve sempre incluir `AGUARDANDO_PAGAMENTO`, `EM_SEPARACAO` e `AGUARDANDO_ENVIO`.

2. **Blindagem Zero-PII e Dados Cadastrais:**
   - A carteira de clientes reais NUNCA deve ser commitada em `public/dados_clientes.js` (mantido no `.gitignore` e vazio no código).
   - Os dados cadastrais do emitente/remetente (endereço, telefone, CNPJ) devem ser lidos da tabela `configuracoes` do banco de dados ou de variáveis de ambiente, nunca hardcoded no código-fonte.

3. **Isolamento:**
   - Regras específicas do comércio de couros e peles pertencem exclusivamente a esta pasta e não devem ser enviadas ao `erp-base` nem a outros clientes.
