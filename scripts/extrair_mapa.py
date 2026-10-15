import re

with open('public/mapa_raw.html', 'r', encoding='utf-8') as f:
    html = f.read()

m = re.search(r'<svg[^>]*>.*?</svg>', html, re.DOTALL)
if m:
    svg = m.group(0)
    print(f'SVG encontrado! Tamanho: {len(svg)}')
    ids = re.findall(r'<path[^>]*id=["\']([A-Z]{2})["\']', svg)
    print(f'Estados encontrados (total {len(ids)}): {ids}')
    with open('public/brasil.svg', 'w', encoding='utf-8') as sf:
        sf.write(svg)
else:
    print('SVG não encontrado')
