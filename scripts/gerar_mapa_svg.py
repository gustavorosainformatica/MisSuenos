import json
import xml.etree.ElementTree as ET

# Tabela IBGE -> Sigla e Nome Formatado
ibge_info = {
    '11': ('RO', 'Rondônia'),
    '12': ('AC', 'Acre'),
    '13': ('AM', 'Amazonas'),
    '14': ('RR', 'Roraima'),
    '15': ('PA', 'Pará'),
    '16': ('AP', 'Amapá'),
    '17': ('TO', 'Tocantins'),
    '21': ('MA', 'Maranhão'),
    '22': ('PI', 'Piauí'),
    '23': ('CE', 'Ceará'),
    '24': ('RN', 'Rio Grande do Norte'),
    '25': ('PB', 'Paraíba'),
    '26': ('PE', 'Pernambuco'),
    '27': ('AL', 'Alagoas'),
    '28': ('SE', 'Sergipe'),
    '29': ('BA', 'Bahia'),
    '31': ('MG', 'Minas Gerais'),
    '32': ('ES', 'Espírito Santo'),
    '33': ('RJ', 'Rio de Janeiro'),
    '35': ('SP', 'São Paulo'),
    '41': ('PR', 'Paraná'),
    '42': ('SC', 'Santa Catarina'),
    '43': ('RS', 'Rio Grande do Sul'),
    '50': ('MS', 'Mato Grosso do Sul'),
    '51': ('MT', 'Mato Grosso'),
    '52': ('GO', 'Goiás'),
    '53': ('DF', 'Distrito Federal')
}

with open('public/br_unidades_da_federacao.json', 'r', encoding='utf-8') as f:
    ufs_json = json.load(f)

# Lê o SVG original
with open('public/brasil_estados.svg', 'r', encoding='utf-8') as f:
    svg_raw = f.read()

# Parse XML
ET.register_namespace('', 'http://www.w3.org/2000/svg')
tree = ET.fromstring(svg_raw)

# Encontra todos os paths
paths = tree.findall('.//{http://www.w3.org/2000/svg}path')
if not paths:
    paths = tree.findall('.//path')

print(f"Total de paths encontrados: {len(paths)}")

for i, p in enumerate(paths):
    u = ufs_json[i]
    cd = u['CD_GEOCUF']
    sigla, nome = ibge_info[cd]
    p.set('id', f'uf-{sigla}')
    p.set('data-uf', sigla)
    p.set('data-nome', nome)
    p.set('class', 'estado-path')
    p.set('vector-effect', 'non-scaling-stroke')

# Converte de volta para string
svg_final = ET.tostring(tree, encoding='unicode')

with open('public/mapa_brasil_interativo.svg', 'w', encoding='utf-8') as f:
    f.write(svg_final)

print("SVG gerado com sucesso em public/mapa_brasil_interativo.svg!")
