# 🚀 Guia de Sincronização Upstream (Base Template & Clientes)
**Autor:** Gustavo Rosa Informática  
**Padrão:** Git Upstream Workflow (White-Label Multi-Cliente)

Este documento explica como manter este projeto (`MisSuenos`) e os projetos de novos clientes sincronizados com o repositório base (`erp-base`), recebendo novas funcionalidades e correções sem perder a identidade e os dados locais.

---

## 1. Vínculos Remotos deste Projeto

Neste projeto ([`MisSuenos`](file:///d:/projetos-agy/MisSuenos)), temos dois links remotos configurados:
- **`origin`**: Repositório oficial do cliente no GitHub (`https://github.com/gustavorosainformatica/MisSuenos.git`).
- **`upstream`**: Repositório do template base limpo (`https://github.com/gustavorosainformatica/erp-base.git` ou pasta local `d:\projetos-agy\erp-base`).

---

## 2. Como Receber Novidades do Sistema Base

Quando você desenvolver melhorias, novas telas ou relatórios no `erp-base`, basta rodar aqui no terminal de `MisSuenos`:

```powershell
# Puxa as novidades do template base
git pull upstream main --allow-unrelated-histories

# Envia o projeto atualizado da Mis Sueños para o GitHub dela
git push origin main
```

---

## 3. Arquivos Protegidos por Cliente (Nunca sobrescritos)

- **`public/app-config.js`**: Guarda o nome "Mis Sueños", logo "🪵" e parâmetros fiscais.
- **`database/clientes.db`**: Banco SQLite local contendo todos os clientes reais.
- **`.env`**: Chaves de produção do Turso Cloud e S3 da Mis Sueños.
- **`public/uploads/`**: Arquivos e comprovantes anexados.
