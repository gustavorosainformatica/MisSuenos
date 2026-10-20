#!/usr/bin/env node
/**
 * Script de Inicialização da Tabela de Pedidos (Mis Sueños ERP)
 * Autor: Gustavo Rosa Informática
 * Inicializa a tabela 'pedidos' e popula registros iniciais com clientes reais da base.
 */

import { inicializarTabelas, query, run } from '../lib/db.js';

const PEDIDOS_INICIAIS = [
  { numero: '#PED-1042', data: '15/10/2026', cliente: 'ACÁCIO BENEDITO RAMOS', cidade: 'CONCEIÇÃO DOS OUROS', uf: 'MG', tel: '(35) 99988-7766', itens: '2x Lonca de Cabrito Selecionada + 1x Tento 100m', valor: 385.00, status: 'AGUARDANDO_ENVIO', statusTexto: 'Aguardando Envio', rastreio: '', obs: 'Enviar via Superfrete (Correios PAC)' },
  { numero: '#PED-1041', data: '14/10/2026', cliente: 'ADAIR JOSÉ BRANCO', cidade: 'PONTE ALTA', uf: 'SC', tel: '(49) 98877-6655', itens: '1x Meio Couro Cru Sovado + 1x Faca Sogueiro 5"', valor: 455.00, status: 'EM_SEPARACAO', statusTexto: 'Em Separação', rastreio: '', obs: 'Separar couro de maior espessura' },
  { numero: '#PED-1040', data: '14/10/2026', cliente: 'ADAM HUPPES', cidade: 'ESTRELA', uf: 'RS', tel: '(51) 99887-7665', itens: '3x Lonca de Potro Sovada Extra', valor: 585.00, status: 'AGUARDANDO_ENVIO', statusTexto: 'Aguardando Envio', rastreio: '', obs: 'Cliente retira ou envio rápido via Sedex' },
  { numero: '#PED-1039', data: '13/10/2026', cliente: 'ADAMO CONSUL', cidade: 'TRAMANDAÍ', uf: 'RS', tel: '(51) 98765-4321', itens: '1x Tento Lonca 50m + 1x Jogo Vazadores 6 pçs', valor: 245.00, status: 'ENVIADO', statusTexto: 'Enviado', rastreio: 'QC123456789BR', obs: 'Enviado via Jadlog Package' },
  { numero: '#PED-1038', data: '12/10/2026', cliente: 'ADEMAR MELOS CARDOSO', cidade: 'SÃO FRANCISCO DE PAULA', uf: 'RS', tel: '(54) 99112-2334', itens: '10kg Sola Bovina Curtume (4-5mm)', valor: 650.00, status: 'ENVIADO', statusTexto: 'Enviado', rastreio: 'SL987654321BR', obs: 'Entregue na transportadora' },
  { numero: '#PED-1037', data: '11/10/2026', cliente: 'ADEMILSON CLEMENTE DE LIMA', cidade: 'MACEDÔNIA', uf: 'SP', tel: '(17) 99223-3445', itens: '2x Vaqueta Tratada Nobre Estonada', valor: 170.00, status: 'ENVIADO', statusTexto: 'Enviado', rastreio: 'QC456789123BR', obs: 'Postado via Superfrete PAC' },
  { numero: '#PED-1036', data: '10/10/2026', cliente: 'ADEMIR DONATO', cidade: 'JATAÍ', uf: 'GO', tel: '(64) 99334-4556', itens: '4x Lonca de Cabrito + 2x Brunidor Madeira', valor: 656.00, status: 'ENVIADO', statusTexto: 'Enviado', rastreio: 'QD789123456BR', obs: 'Destinatário confirmado' },
  { numero: '#PED-1035', data: '09/10/2026', cliente: 'ADILSON IFRAN MARTINS', cidade: 'SÃO BORJA', uf: 'RS', tel: '(55) 99445-5667', itens: '1x Meio Couro Cru Sovado + 2x Tento 100m', valor: 470.00, status: 'ENVIADO', statusTexto: 'Enviado', rastreio: 'QC654321987BR', obs: 'Entregue com sucesso' }
];

async function main() {
  console.log('--- INICIALIZANDO TABELA DE PEDIDOS ---');
  await inicializarTabelas();

  // Verifica se a tabela já possui pedidos cadastrados
  const existentes = await query('SELECT count(*) as total FROM pedidos');
  const total = existentes[0]?.total || 0;
  console.log(`[PEDIDOS] Total de pedidos já existentes no banco: ${total}`);

  if (total === 0) {
    console.log('[PEDIDOS] Populando pedidos iniciais vinculados a clientes...');
    
    // Busca clientes para vincular cliente_id
    const clientes = await query('SELECT id, nome, cidade, uf, telefone FROM clientes');
    const mapaClientes = new Map(clientes.map(c => [c.nome.trim().toUpperCase(), c]));

    for (const p of PEDIDOS_INICIAIS) {
      const matchCli = mapaClientes.get(p.cliente.trim().toUpperCase());
      const clienteId = matchCli ? matchCli.id : null;
      const cidade = matchCli ? matchCli.cidade : p.cidade;
      const uf = matchCli ? matchCli.uf : p.uf;
      const telefone = matchCli ? (matchCli.telefone || p.tel) : p.tel;

      await run(`
        INSERT INTO pedidos (
          numero, cliente_id, cliente_nome, cidade, uf, telefone,
          itens, valor_total, status, status_texto, codigo_rastreio, observacoes, data_pedido, data_atualizacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        p.numero,
        clienteId,
        p.cliente,
        cidade,
        uf,
        telefone,
        p.itens,
        p.valor,
        p.status,
        p.statusTexto,
        p.rastreio,
        p.obs,
        p.data,
        new Date().toISOString()
      ]);
      console.log(`  + Pedido ${p.numero} inserido para ${p.cliente} (R$ ${p.valor.toFixed(2)})`);
    }
    console.log('✅ Pedidos iniciais populados com sucesso no banco!');
  } else {
    console.log('ℹ️ Tabela de pedidos já contém dados. Nenhuma alteração necessária.');
  }
}

main().catch(err => {
  console.error('[ERRO INIT PEDIDOS]', err);
  process.exit(1);
});
