#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de Conversão e Extração de Endereços de Clientes (Mis Sueños)
Lê todos os arquivos .docx da pasta 'ENDEREÇOS DE ENVIO', extrai as informações
estruturadas e grava em banco de dados SQLite, JSON, CSV e JS (offline).
"""

import os
import sys
import re
import json
import csv
import sqlite3
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime

# Garante saída em UTF-8 no terminal Windows
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS_DIR = os.path.join(BASE_DIR, 'ENDEREÇOS DE ENVIO')
DB_DIR = os.path.join(BASE_DIR, 'database')
DB_PATH = os.path.join(DB_DIR, 'clientes.db')
JSON_PATH = os.path.join(DB_DIR, 'clientes.json')
CSV_PATH = os.path.join(DB_DIR, 'clientes.csv')
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')
JS_DATA_PATH = os.path.join(PUBLIC_DIR, 'dados_clientes.js')

# Namespace do WordprocessingML
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

# Lista de UFs brasileiras válidas
UFS_VALIDAS = {
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
}

def extrair_paragrafos_docx(caminho_arquivo):
    """Extrai todas as linhas de texto parágrafo a parágrafo de um arquivo .docx."""
    linhas = []
    try:
        with zipfile.ZipFile(caminho_arquivo) as z:
            if 'word/document.xml' not in z.namelist():
                return []
            conteudo_xml = z.read('word/document.xml')
            arvore = ET.fromstring(conteudo_xml)
            for p in arvore.findall('.//w:p', NS):
                nos_t = p.findall('.//w:t', NS)
                texto = ''.join(no.text for no in nos_t if no.text).strip()
                if texto:
                    linhas.append(texto)
    except Exception as e:
        print(f"Erro ao ler '{os.path.basename(caminho_arquivo)}': {e}")
    return linhas

def deduzir_uf_por_cep(cep_limpo):
    """Deduz a UF pelo código postal brasileiro (faixas de CEP dos Correios)."""
    if not cep_limpo or len(cep_limpo) < 2:
        return ''
    try:
        p2 = int(cep_limpo[:2])
    except ValueError:
        return ''
    
    if p2 < 20: return 'SP'
    if 20 <= p2 <= 28: return 'RJ'
    if p2 == 29: return 'ES'
    if 30 <= p2 <= 39: return 'MG'
    if 40 <= p2 <= 48: return 'BA'
    if p2 == 49: return 'SE'
    if 50 <= p2 <= 56: return 'PE'
    if p2 == 57: return 'AL'
    if p2 == 58: return 'PB'
    if p2 == 59: return 'RN'
    if 60 <= p2 <= 63: return 'CE'
    if p2 == 64: return 'PI'
    if p2 == 65: return 'MA'
    if 66 <= p2 <= 68: return 'PA'
    if p2 == 68: return 'AP'
    if p2 == 69: return 'AM'
    if 70 <= p2 <= 72 or 73 <= p2 <= 76: return 'GO'
    if p2 == 77: return 'TO'
    if p2 == 78: return 'MT'
    if p2 == 79: return 'MS'
    if 80 <= p2 <= 87: return 'PR'
    if 88 <= p2 <= 89: return 'SC'
    if 90 <= p2 <= 99: return 'RS'
    return ''

def extrair_apelido_arquivo(nome_arquivo):
    """Extrai apelido ou razão de loja contida no nome do arquivo (ex: 'ADILSON - D S COUROS.docx')."""
    base = os.path.splitext(nome_arquivo)[0].strip()
    partes = [p.strip() for p in base.split(' - ') if p.strip()]
    if len(partes) >= 2:
        return ' - '.join(partes[1:])
    return ''

def formatar_cpf(digitos):
    """Formata CPF de 11 dígitos no padrão 000.000.000-00."""
    if len(digitos) == 11:
        return f"{digitos[0:3]}.{digitos[3:6]}.{digitos[6:9]}-{digitos[9:11]}"
    return digitos

def formatar_cnpj(digitos):
    """Formata CNPJ de 14 dígitos no padrão 00.000.000/0001-00."""
    if len(digitos) == 14:
        return f"{digitos[0:2]}.{digitos[2:5]}.{digitos[5:8]}/{digitos[8:12]}-{digitos[12:14]}"
    return digitos

def formatar_cep(digitos):
    """Formata CEP de 8 dígitos no padrão 00000-000."""
    if len(digitos) == 8:
        return f"{digitos[0:5]}-{digitos[5:8]}"
    return digitos

def formatar_telefone(digitos):
    """Formata telefone com DDD no padrão (00) 00000-0000 ou (00) 0000-0000."""
    if len(digitos) == 11:
        return f"({digitos[0:2]}) {digitos[2:7]}-{digitos[7:11]}"
    elif len(digitos) == 10:
        return f"({digitos[0:2]}) {digitos[2:6]}-{digitos[6:10]}"
    return digitos

def separar_logradouro_numero(texto_endereco):
    """Separa logradouro, número e complemento de uma linha de endereço."""
    if not texto_endereco:
        return '', '', ''
    
    s = re.sub(r'^(?:End\.?|Endere[çc]o)\s*[:\.]?\s*', '', texto_endereco, flags=re.I).strip()
    s = re.sub(r'^(Rua|Av\.?|Avenida)\s*:\s*', r'\1 ', s, flags=re.I).strip()
    
    padrao = re.search(
        r'^(.*?)[,\s]+(?:n[ºo°]?\s*)?(\d+|s\/?n[ºo°]?)(?:\s*[,-]?\s*(.*))?$',
        s,
        re.I
    )
    if padrao:
        logr = padrao.group(1).strip()
        num = padrao.group(2).strip().upper()
        comp = padrao.group(3).strip() if padrao.group(3) else ''
        return logr, num, comp
    
    return s, '', ''

def eh_template_em_branco(linhas):
    """Verifica se o documento é apenas um template/modelo em branco sem dados."""
    texto_completo = ' '.join(linhas).strip()
    texto_simplificado = re.sub(r'[\s\:\,\.\-]+', '', texto_completo).upper()
    
    modelos_vazios = [
        'DESTINATÁRIORUABAIRROCEPCPF',
        'DESTINATÁRIORUABAIRROCEP',
        'DESTINATÁRIORUABAIRRO',
        'DESTINATÁRIORUACEP',
        'DESTINATÁRIORUA',
        'DESTINATÁRIOCEP',
        ''
    ]
    if texto_simplificado in modelos_vazios:
        return True
        
    palavras_chave_puras = {'destinatário:', 'destinatario:', 'destinatário', 'rua', 'rua:', 'bairro', 'bairro:', 'cep', 'cep:', 'cpf', 'cpf:'}
    linhas_sem_valor = [l.strip().lower() for l in linhas if l.strip().lower() in palavras_chave_puras]
    if len(linhas_sem_valor) == len(linhas):
        return True
        
    return False

def processar_arquivo_docx(caminho_arquivo):
    """Analisa um arquivo docx individual e extrai o registro do cliente."""
    nome_arquivo = os.path.basename(caminho_arquivo)
    linhas = extrair_paragrafos_docx(caminho_arquivo)
    
    if eh_template_em_branco(linhas):
        return None
    
    linhas_destinatario = []
    for l in linhas:
        if re.search(r'remetente\s*:\s*marcos', l, re.I) or (re.search(r'remetente\s*:', l, re.I) and 'NUNES' in l.upper()):
            break
        linhas_destinatario.append(l)
    
    if not linhas_destinatario:
        linhas_destinatario = linhas
    
    if eh_template_em_branco(linhas_destinatario):
        return None
        
    bloco_texto = '\n'.join(linhas_destinatario)
    
    # 1. NOME
    nome = ''
    idx_linha_nome = -1
    for idx, l in enumerate(linhas_destinatario):
        m = re.match(r'^destinat[áa]rio\s*[:\.]?\s*(.+)$', l, re.I)
        if m and m.group(1).strip() and m.group(1).strip() not in (':', '..', '-'):
            nome = m.group(1).strip()
            idx_linha_nome = idx
            break
        elif re.match(r'^destinat[áa]rio\s*[:\.]?$', l, re.I):
            if idx + 1 < len(linhas_destinatario):
                prox = linhas_destinatario[idx + 1].strip()
                if not re.match(r'^(?:rua|av|estrada|rodovia|bairro|cep|cpf|cnpj)\b', prox, re.I):
                    nome = prox
                    idx_linha_nome = idx + 1
                    break
        elif re.match(r'^(?:remetente|raz[ãa]o social)\s*[:\.]?\s*(.+)$', l, re.I):
            val = l.split(':', 1)[1].strip()
            val_limpo = re.sub(r'^\d+[\.\d\/\-]*\s*', '', val).strip()
            if val_limpo:
                nome = val_limpo
                idx_linha_nome = idx
                break
                
    if not nome or nome in (':', '..', '-', 'RUA', 'DESTINATÁRIO'):
        nome = os.path.splitext(nome_arquivo)[0].strip()
        nome = re.sub(r'\s*-\s*.*$', '', nome).strip()
    
    nome = re.sub(r'^[,\.\-\:\s]+', '', nome).strip()
    
    # 2. APELIDO
    apelido = extrair_apelido_arquivo(nome_arquivo)
    
    # 3. CPF, CNPJ, IE, RAZÃO SOCIAL, TELEFONE
    cpf = ''
    cpf_limpo = ''
    cnpj = ''
    cnpj_limpo = ''
    ie = ''
    telefone = ''
    telefone_limpo = ''
    razao_social = ''
    
    indices_docs = set()
    
    for idx, l in enumerate(linhas_destinatario):
        l_upper = l.upper()
        l_sem_copiar = re.split(r'\s+copiar', l, flags=re.I)[0].strip()
        
        # CPF
        if 'CPF' in l_upper and not cpf:
            digs = re.sub(r'\D', '', l_sem_copiar)
            if len(digs) == 11:
                cpf_limpo = digs
                cpf = formatar_cpf(digs)
                indices_docs.add(idx)
        
        # CNPJ
        if ('CNPJ' in l_upper or 'CPNJ' in l_upper) and not cnpj:
            digs = re.sub(r'\D', '', l_sem_copiar)
            if len(digs) == 14:
                cnpj_limpo = digs
                cnpj = formatar_cnpj(digs)
                indices_docs.add(idx)
        elif not cnpj:
            m_cnpj_fmt = re.search(r'\b\d{2}\.\d{3}\.\d{3}\/\d{4}[-.]\d{2}\b', l_sem_copiar)
            if m_cnpj_fmt:
                digs = re.sub(r'\D', '', m_cnpj_fmt.group(0))
                if len(digs) == 14:
                    cnpj_limpo = digs
                    cnpj = formatar_cnpj(digs)
                    indices_docs.add(idx)
                    
        # Inscrição Estadual (IE)
        if re.search(r'\bI\.?E\.?\b', l, re.I) and not ie:
            partes = re.split(r'I\.?E\.?\s*[:\.]?\s*', l_sem_copiar, flags=re.I)
            if len(partes) > 1 and partes[1].strip():
                ie = partes[1].strip()
                indices_docs.add(idx)
                
        # Razão Social
        if 'RAZÃO SOCIAL' in l_upper or 'RAZAO SOCIAL' in l_upper:
            partes = re.split(r'Raz[ãa]o\s*social\s*[:\.]?\s*', l, flags=re.I)
            if len(partes) > 1 and partes[1].strip():
                razao_social = partes[1].strip()
                indices_docs.add(idx)
                
        # Telefone
        if any(k in l_upper for k in ['FONE', 'TELEFONE', 'TEL:', 'CEL:', 'WHATS:']) and not telefone:
            m_tel = re.search(r'(?:fone|tel|cel|whats|telefone)\s*[:\.]?\s*([0-9\(\)\s\-]{8,20})', l, re.I)
            if m_tel:
                digs = re.sub(r'\D', '', m_tel.group(1))
                if len(digs) >= 8:
                    telefone_limpo = digs
                    telefone = formatar_telefone(digs)
                    indices_docs.add(idx)
                    
    # 4. CEP
    cep = ''
    cep_limpo = ''
    idx_linha_cep = -1
    for idx, l in enumerate(linhas_destinatario):
        if 'CEP' in l.upper():
            digs = re.sub(r'\D', '', l)
            if len(digs) == 8:
                cep_limpo = digs
                cep = formatar_cep(digs)
                idx_linha_cep = idx
                break
    if not cep:
        m_cep = re.search(r'\b(\d{2}\.?\d{3}[-\s]?\d{3})\b', bloco_texto)
        if m_cep:
            digs = re.sub(r'\D', '', m_cep.group(1))
            if len(digs) == 8:
                cep_limpo = digs
                cep = formatar_cep(digs)
                
    # 5. CIDADE E UF
    cidade = ''
    uf = ''
    idx_linha_cidade = -1
    for idx, l in enumerate(linhas_destinatario):
        if idx in indices_docs or idx == idx_linha_cep or idx == idx_linha_nome:
            continue
        m_cid = re.search(r'^([A-Za-zÀ-ÿ\s\.\']+)\s*[-–—/]\s*([A-Za-z]{2})\b', l)
        if m_cid:
            u = m_cid.group(2).strip().upper()
            if u in UFS_VALIDAS:
                cidade = m_cid.group(1).strip()
                uf = u
                idx_linha_cidade = idx
                break
        m_cid2 = re.search(r'^([A-Za-zÀ-ÿ\s\.\']+)\s+([A-Za-z]{2})$', l)
        if m_cid2:
            u = m_cid2.group(2).strip().upper()
            if u in UFS_VALIDAS and not re.search(r'^(?:rua|av|estrada|rodovia|bairro|cep|fone)', l, re.I):
                cidade = m_cid2.group(1).strip()
                uf = u
                idx_linha_cidade = idx
                break
                
    if not cidade and idx_linha_cep > 0:
        candidata = linhas_destinatario[idx_linha_cep - 1].strip()
        if not re.search(r'^(?:rua|av|estrada|rodovia|bairro|cpf|cnpj|fone)', candidata, re.I):
            cidade = candidata
            idx_linha_cidade = idx_linha_cep - 1
            
    if not uf and cep_limpo:
        uf = deduzir_uf_por_cep(cep_limpo)
        
    # 6. BAIRRO
    bairro = ''
    idx_linha_bairro = -1
    for idx, l in enumerate(linhas_destinatario):
        if idx in indices_docs or idx in (idx_linha_nome, idx_linha_cidade, idx_linha_cep):
            continue
        m_b = re.match(r'^(?:bairro|b\.)\s*[:\.]?\s*(.+)$', l, re.I)
        if m_b:
            bairro = m_b.group(1).strip()
            idx_linha_bairro = idx
            break
            
    if not bairro and idx_linha_cidade > 1:
        for idx in range(idx_linha_cidade - 1, idx_linha_nome, -1):
            if idx in indices_docs or idx == idx_linha_cep:
                continue
            cand = linhas_destinatario[idx].strip()
            if not re.search(r'^(?:rua|r\.|av\.|avenida|estrada|rodovia|fazenda|br\s*\d|cep|cpf|cnpj|ie|fone|tel|cel|whats|copiar)', cand, re.I):
                bairro = cand
                idx_linha_bairro = idx
                break
                
    # 7. LOGRADOURO
    endereco_bruto = ''
    idx_linha_endereco = -1
    for idx, l in enumerate(linhas_destinatario):
        if idx in indices_docs or idx in (idx_linha_nome, idx_linha_cidade, idx_linha_bairro, idx_linha_cep):
            continue
        if re.search(r'^(?:rua|r\.|av\.|avenida|rodovia|estrada|travessa|linha|fazenda|s[íi]tio|ch[áa]cara|zona|caixa\s*postal|vila|alameda|end|br\s*\d)', l, re.I):
            endereco_bruto = l.strip()
            idx_linha_endereco = idx
            break
            
    if not endereco_bruto and idx_linha_nome != -1:
        for idx in range(idx_linha_nome + 1, len(linhas_destinatario)):
            if idx in indices_docs or idx in (idx_linha_cidade, idx_linha_bairro, idx_linha_cep):
                continue
            cand = linhas_destinatario[idx].strip()
            if not re.search(r'^(?:cep|cpf|cnpj|ie|fone|tel|cel|whats|copiar|raz[ãa]o)', cand, re.I):
                endereco_bruto = cand
                idx_linha_endereco = idx
                break
                
    logradouro, numero, complemento = separar_logradouro_numero(endereco_bruto)
    
    # 8. OBSERVAÇÕES
    linhas_extras = []
    indices_usados = {idx_linha_nome, idx_linha_endereco, idx_linha_bairro, idx_linha_cidade, idx_linha_cep} | indices_docs
    for idx, l in enumerate(linhas_destinatario):
        if idx in indices_usados:
            continue
        if re.match(r'^(?:cep|cpf|cnpj|ie|i\.e\.|fone|tel|cel|copiar)\b', l, re.I):
            continue
        linhas_extras.append(l.strip())
        
    observacoes = ' | '.join(linhas_extras) if linhas_extras else ''
    
    return {
        'nome': nome,
        'apelido_referencia': apelido,
        'razao_social': razao_social,
        'cpf': cpf,
        'cpf_limpo': cpf_limpo,
        'cnpj': cnpj,
        'cnpj_limpo': cnpj_limpo,
        'ie': ie,
        'telefone': telefone,
        'telefone_limpo': telefone_limpo,
        'endereco_completo': endereco_bruto,
        'logradouro': logradouro,
        'numero': numero,
        'complemento': complemento,
        'bairro': bairro,
        'cidade': cidade,
        'uf': uf,
        'cep': cep,
        'cep_limpo': cep_limpo,
        'observacoes': observacoes,
        'arquivo_origem': nome_arquivo,
        'data_cadastro': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }

def criar_banco_sqlite(caminho_db):
    """Cria a estrutura de tabelas e índices no SQLite."""
    os.makedirs(os.path.dirname(caminho_db), exist_ok=True)
    conn = sqlite3.connect(caminho_db)
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            uf TEXT,
            cep TEXT,
            cep_limpo TEXT,
            observacoes TEXT,
            arquivo_origem TEXT UNIQUE,
            data_cadastro TEXT
        );
    """)
    
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(nome);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes(cpf_limpo);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clientes_cnpj ON clientes(cnpj_limpo);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clientes_cidade_uf ON clientes(cidade, uf);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clientes_cep ON clientes(cep_limpo);")
    
    conn.commit()
    return conn

def salvar_no_sqlite(conn, registros):
    """Salva os registros extraídos na tabela clientes."""
    cursor = conn.cursor()
    cursor.execute("DELETE FROM clientes;")
    
    sql = """
        INSERT INTO clientes (
            nome, apelido_referencia, razao_social,
            cpf, cpf_limpo, cnpj, cnpj_limpo, ie,
            telefone, telefone_limpo, endereco_completo,
            logradouro, numero, complemento, bairro,
            cidade, uf, cep, cep_limpo,
            observacoes, arquivo_origem, data_cadastro
        ) VALUES (
            :nome, :apelido_referencia, :razao_social,
            :cpf, :cpf_limpo, :cnpj, :cnpj_limpo, :ie,
            :telefone, :telefone_limpo, :endereco_completo,
            :logradouro, :numero, :complemento, :bairro,
            :cidade, :uf, :cep, :cep_limpo,
            :observacoes, :arquivo_origem, :data_cadastro
        );
    """
    cursor.executemany(sql, registros)
    conn.commit()

def exportar_para_json(registros, caminho_json):
    """Exporta lista de clientes para arquivo JSON formatado em UTF-8."""
    os.makedirs(os.path.dirname(caminho_json), exist_ok=True)
    with open(caminho_json, 'w', encoding='utf-8') as f:
        json.dump(registros, f, ensure_ascii=False, indent=2)

def exportar_para_csv(registros, caminho_csv):
    """Exporta lista de clientes para CSV formatado em UTF-8 com BOM (ideal para Excel)."""
    if not registros:
        return
    os.makedirs(os.path.dirname(caminho_csv), exist_ok=True)
    campos = list(registros[0].keys())
    with open(caminho_csv, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=campos, delimiter=';')
        writer.writeheader()
        writer.writerows(registros)

def exportar_para_js_offline(registros, caminho_js):
    """Exporta lista de clientes para arquivo JS com window.CLIENTES_DATA para suporte offline."""
    os.makedirs(os.path.dirname(caminho_js), exist_ok=True)
    with open(caminho_js, 'w', encoding='utf-8') as f:
        f.write('window.CLIENTES_DATA = ' + json.dumps(registros, ensure_ascii=False) + ';')

def main():
    print("=" * 70)
    print("  CONVERSOR DE ENDEREÇOS MIS SUEÑOS -> BANCO DE DADOS DE CLIENTES")
    print("=" * 70)
    
    if not os.path.isdir(DOCS_DIR):
        print(f"Diretório não encontrado: {DOCS_DIR}")
        sys.exit(1)
        
    arquivos = sorted([f for f in os.listdir(DOCS_DIR) if f.lower().endswith('.docx')])
    total_arquivos = len(arquivos)
    print(f"[*] Total de arquivos .docx encontrados: {total_arquivos}")
    
    registros = []
    ignorados_templates = 0
    
    for f in arquivos:
        caminho = os.path.join(DOCS_DIR, f)
        reg = processar_arquivo_docx(caminho)
        if reg is None:
            ignorados_templates += 1
        else:
            registros.append(reg)
            
    print(f"[*] Arquivos de clientes processados com sucesso: {len(registros)}")
    print(f"[*] Modelos/templates em branco ignorados: {ignorados_templates}")
    
    # 1. Gravação no SQLite
    print(f"\n[1/4] Gravando banco de dados SQLite em: {DB_PATH}")
    conn = criar_banco_sqlite(DB_PATH)
    salvar_no_sqlite(conn, registros)
    conn.close()
    print("      ✓ Banco de dados SQLite gerado com sucesso!")
    
    # 2. Exportação JSON
    print(f"[2/4] Exportando dados em JSON para: {JSON_PATH}")
    exportar_para_json(registros, JSON_PATH)
    print("      ✓ Arquivo JSON gerado com sucesso!")
    
    # 3. Exportação CSV
    print(f"[3/4] Exportando planilha CSV (para Excel) para: {CSV_PATH}")
    exportar_para_csv(registros, CSV_PATH)
    print("      ✓ Planilha CSV gerada com sucesso!")

    # 4. Exportação JS Offline para o Painel Web
    print(f"[4/4] Exportando script offline para o Painel Web em: {JS_DATA_PATH}")
    exportar_para_js_offline(registros, JS_DATA_PATH)
    print("      ✓ Script offline gerado com sucesso!")
    
    # Resumo estatístico
    print("\n" + "=" * 70)
    print("  RESUMO DA BASE DE CLIENTES GERADA")
    print("=" * 70)
    print(f"  • Total de Clientes Cadastrados: {len(registros)}")
    com_cidade = sum(1 for r in registros if r['cidade'])
    com_uf = sum(1 for r in registros if r['uf'])
    com_cep = sum(1 for r in registros if r['cep'])
    com_cpf = sum(1 for r in registros if r['cpf'])
    com_cnpj = sum(1 for r in registros if r['cnpj'])
    com_ie = sum(1 for r in registros if r['ie'])
    com_fone = sum(1 for r in registros if r['telefone'])
    com_apelido = sum(1 for r in registros if r['apelido_referencia'])
    
    print(f"  • Com Cidade: {com_cidade} ({com_cidade/len(registros)*100:.1f}%)")
    print(f"  • Com UF/Estado: {com_uf} ({com_uf/len(registros)*100:.1f}%)")
    print(f"  • Com CEP: {com_cep} ({com_cep/len(registros)*100:.1f}%)")
    print(f"  • Com CPF: {com_cpf}")
    print(f"  • Com CNPJ: {com_cnpj}")
    print(f"  • Com Inscrição Estadual: {com_ie}")
    print(f"  • Com Telefone: {com_fone}")
    print(f"  • Com Apelido/Loja identificada: {com_apelido}")
    print("=" * 70)
    print("\nProcesso concluído com êxito!")

if __name__ == '__main__':
    main()
