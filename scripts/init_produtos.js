import { query, run, execute } from '../lib/db.js';

async function main() {
  console.log('[PRODUTOS] Inicializando tabela de produtos...');

  const sqlTabela = `
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo_sku TEXT UNIQUE,
      nome TEXT NOT NULL,
      categoria TEXT NOT NULL,
      unidade_medida TEXT DEFAULT 'UN',
      preco_custo REAL DEFAULT 0,
      preco_venda REAL NOT NULL DEFAULT 0,
      estoque_atual REAL NOT NULL DEFAULT 0,
      estoque_minimo REAL DEFAULT 5,
      descricao TEXT,
      ativo INTEGER DEFAULT 1,
      data_cadastro TEXT NOT NULL,
      data_atualizacao TEXT
    );
  `;
  await execute(sqlTabela);

  // Índices
  try {
    await execute('CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos (categoria);');
    await execute('CREATE INDEX IF NOT EXISTS idx_produtos_sku ON produtos (codigo_sku);');
    await execute('CREATE INDEX IF NOT EXISTS idx_produtos_nome ON produtos (nome);');
  } catch (e) {
    console.log('[PRODUTOS AVISO] Índices já existentes ou dispensados:', e.message);
  }

  const contagem = await query('SELECT COUNT(*) as total FROM produtos');
  const total = Number(contagem[0]?.total || contagem[0]?.[0] || 0);
  console.log(`[PRODUTOS] Total de produtos existentes: ${total}`);

  if (total === 0) {
    const catalogo = [
      {
        sku: 'SKU-LON-001',
        nome: 'Lonca de Cabrito Legítima Selecionada',
        cat: 'Loncas',
        un: 'Peça',
        custo: 85.00,
        venda: 145.00,
        est: 45,
        min: 10,
        desc: 'Lonca de cabrito selecionada, sem falhas, ideal para trabalhos finos de sogueiro e trançados.'
      },
      {
        sku: 'SKU-LON-002',
        nome: 'Lonca de Potro Sovada Extra Macia',
        cat: 'Loncas',
        un: 'Peça',
        custo: 120.00,
        venda: 195.00,
        est: 28,
        min: 8,
        desc: 'Lonca de potro de altíssima maciez e resistência para arreios, laços e rédeas.'
      },
      {
        sku: 'SKU-LON-003',
        nome: 'Lonca Crua Natural Tradicional',
        cat: 'Loncas',
        un: 'Peça',
        custo: 70.00,
        venda: 120.00,
        est: 35,
        min: 10,
        desc: 'Lonca crua limpa e esticada em bastidor artesanal para preparo sob medida.'
      },
      {
        sku: 'SKU-COU-001',
        nome: 'Couro Cru Bovino Sovado (Meio)',
        cat: 'Couros & Peles',
        un: 'Peça',
        custo: 160.00,
        venda: 280.00,
        est: 18,
        min: 5,
        desc: 'Meio couro cru sovado para produção de laços, tentos e traias completas de arreio.'
      },
      {
        sku: 'SKU-COU-002',
        nome: 'Sola Bovina Curtume Especial (4-5mm)',
        cat: 'Couros & Peles',
        un: 'Kg',
        custo: 38.00,
        venda: 65.00,
        est: 62,
        min: 15,
        desc: 'Sola vegetal com espessura uniforme de 4 a 5mm para bainhas, cintos e selaria pesada.'
      },
      {
        sku: 'SKU-COU-003',
        nome: 'Vaqueta Tratada Nobre Estonada',
        cat: 'Couros & Peles',
        un: 'Metro',
        custo: 45.00,
        venda: 85.00,
        est: 40,
        min: 10,
        desc: 'Vaqueta macia com acabamento premium e toque sedoso para forrações e guaiacas.'
      },
      {
        sku: 'SKU-TEN-001',
        nome: 'Tento de Couro Cru Cortado (100 Metros)',
        cat: 'Tentos',
        un: 'Rolo',
        custo: 50.00,
        venda: 95.00,
        est: 50,
        min: 12,
        desc: 'Rolo de tentos calibrados de 2.5mm a 3mm para trançadores e artesãos do couro.'
      },
      {
        sku: 'SKU-TEN-002',
        nome: 'Tento de Lonca Fino Especial (50 Metros)',
        cat: 'Tentos',
        un: 'Rolo',
        custo: 60.00,
        venda: 110.00,
        est: 32,
        min: 10,
        desc: 'Tentos finos de lonca de cabrito para botões de laço, bombas e cabeçadas de luxo.'
      },
      {
        sku: 'SKU-FER-001',
        nome: 'Jogo de Vazadores Profissionais de Aço (6 pçs)',
        cat: 'Ferramentas',
        un: 'Jogo',
        custo: 75.00,
        venda: 135.00,
        est: 22,
        min: 5,
        desc: 'Aço temperado forjado de 2mm a 10mm para furação milimétrica precisa.'
      },
      {
        sku: 'SKU-FER-002',
        nome: 'Faca de Sogueiro Tradicional Forjada 5"',
        cat: 'Ferramentas',
        un: 'Unidade',
        custo: 95.00,
        venda: 175.00,
        est: 15,
        min: 4,
        desc: 'Lâmina afiada navalha com cabo em guajuvira para corte e desbaste rente de tentos.'
      },
      {
        sku: 'SKU-FER-003',
        nome: 'Brunidor Anatômico de Madeira Nobre',
        cat: 'Ferramentas',
        un: 'Unidade',
        custo: 18.00,
        venda: 38.00,
        est: 40,
        min: 10,
        desc: 'Brunidor em madeira nobre usinada para acabamento de bordas e virola de sola.'
      }
    ];

    const agora = new Date().toISOString();
    for (const p of catalogo) {
      await run(
        `INSERT INTO produtos (
          codigo_sku, nome, categoria, unidade_medida,
          preco_custo, preco_venda, estoque_atual, estoque_minimo,
          descricao, ativo, data_cadastro
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [p.sku, p.nome, p.cat, p.un, p.custo, p.venda, p.est, p.min, p.desc, agora]
      );
    }
    console.log(`[PRODUTOS] Catálogo inicial cadastrado com sucesso (${catalogo.length} itens)!`);
  }
}

main().then(() => {
  console.log('[PRODUTOS SUCESSO] Concluído!');
  process.exit(0);
}).catch(err => {
  console.error('[PRODUTOS ERRO]', err);
  process.exit(1);
});
