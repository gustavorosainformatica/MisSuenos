#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera o script SQL pronto para migração no Supabase (PostgreSQL na Nuvem)
"""

import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, 'database', 'clientes.db')
SQL_PATH = os.path.join(BASE_DIR, 'database', 'supabase_schema_dados.sql')

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
c = conn.cursor()
c.execute('SELECT * FROM clientes ORDER BY id ASC')
rows = c.fetchall()

sql_lines = []
sql_lines.append('-- ========================================================\n')
sql_lines.append('-- SCHEMA & DADOS PARA O SUPABASE (POSTGRESQL NA NUVEM)\n')
sql_lines.append('-- Projeto: Mis Sueños Clientes\n')
sql_lines.append('-- ========================================================\n\n')

sql_lines.append('''-- 1. Criação da Tabela de Clientes
CREATE TABLE IF NOT EXISTS clientes (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    nome TEXT NOT NULL,
    apelido_referencia TEXT,
    razao_social TEXT,
    cpf TEXT,
    cpf_limpo TEXT,
    cnpj TEXT,
    cnpj_limpo TEXT,
    ie TEXT,
    telefone TEXT,
    telefone_limpo TEXT,
    endereco_completo TEXT,
    logradouro TEXT,
    numero TEXT,
    complemento TEXT,
    bairro TEXT,
    cidade TEXT,
    uf VARCHAR(2),
    cep TEXT,
    cep_limpo TEXT,
    observacoes TEXT,
    arquivo_origem TEXT,
    data_cadastro TEXT
);

-- 2. Habilita Políticas de Acesso (RLS) para leitura e escrita pela API Web
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso Publico Leitura" ON clientes
    FOR SELECT USING (true);

CREATE POLICY "Acesso Publico Edicao" ON clientes
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Acesso Publico Insercao" ON clientes
    FOR INSERT WITH CHECK (true);

-- 3. Índices para Alta Performance de Busca
CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes (nome);
CREATE INDEX IF NOT EXISTS idx_clientes_uf ON clientes (uf);
CREATE INDEX IF NOT EXISTS idx_clientes_cpf_limpo ON clientes (cpf_limpo);
CREATE INDEX IF NOT EXISTS idx_clientes_cnpj_limpo ON clientes (cnpj_limpo);
CREATE INDEX IF NOT EXISTS idx_clientes_cep_limpo ON clientes (cep_limpo);

-- ========================================================
-- INSERÇÃO DOS 1.140 CLIENTES CONSOLIDADOS
-- ========================================================\n\n
''')

cols = [
    'nome', 'apelido_referencia', 'razao_social',
    'cpf', 'cpf_limpo', 'cnpj', 'cnpj_limpo', 'ie',
    'telefone', 'telefone_limpo', 'endereco_completo',
    'logradouro', 'numero', 'complemento', 'bairro',
    'cidade', 'uf', 'cep', 'cep_limpo',
    'observacoes', 'arquivo_origem', 'data_cadastro'
]

for r in rows:
    vals = []
    for col in cols:
        v = r[col]
        if v is None:
            vals.append('NULL')
        else:
            escaped = str(v).replace("'", "''")
            vals.append(f"'{escaped}'")
    sql_lines.append(f"INSERT INTO clientes ({', '.join(cols)}) VALUES ({', '.join(vals)});\n")

with open(SQL_PATH, 'w', encoding='utf-8') as f:
    f.writelines(sql_lines)

print(f"Script SQL gerado com sucesso em: {SQL_PATH}")
print(f"Total de clientes convertidos: {len(rows)}")
