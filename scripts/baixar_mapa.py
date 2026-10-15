import urllib.request
import re

urls = [
    'https://raw.githubusercontent.com/thecodeix/brazil-map/master/src/brazil-map.svg',
    'https://raw.githubusercontent.com/pedrofurtado/brazil-map-svg/master/brazil.svg',
    'https://raw.githubusercontent.com/codecon-dev/mapa-brasil-svg/master/src/mapa.svg',
    'https://upload.wikimedia.org/wikipedia/commons/b/b8/Brazil_states.svg'
]

ufs = ['RS', 'SC', 'PR', 'SP', 'RJ', 'MG', 'BA', 'AM', 'PA', 'MT', 'MS', 'GO', 'CE', 'PE']

for u in urls:
    try:
        req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            text = resp.read().decode('utf-8')
            matches = [uf for uf in ufs if f'id="{uf}"' in text or f'id=\'{uf}\'' in text or f'id="BR-{uf}"' in text or f'id="BR{uf}"' in text]
            print(f'Sucesso: {u} (tam: {len(text)} | UFs achadas: {len(matches)})')
            if len(matches) >= 5:
                with open('public/mapa_brasil.svg', 'w', encoding='utf-8') as f:
                    f.write(text)
                print("Arquivo salvo com sucesso em public/mapa_brasil.svg!")
                break
    except Exception as e:
        print(f'Erro {u}: {e}')
