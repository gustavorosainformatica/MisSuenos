import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('MATEMÁTICA FISCAL: Consistência do KPI de Documentos e Filtros Disjuntos', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');

  // 1. Verifica se o cálculo do KPI não soma cpfs + cnpjs cegamente
  assert.ok(
    !html.includes('document.getElementById(\'kpi-docs\').textContent = (cpfs + cnpjs)'),
    'O card kpi-docs não deve somar cpfs + cnpjs cegamente gerando contagem duplicada'
  );
  assert.ok(
    html.includes('comDoc.toLocaleString(\'pt-BR\')'),
    'O card kpi-docs deve exibir o total de clientes documentados comDoc'
  );

  // 2. Simulação com dados de teste contendo interseção (ambos)
  const mockClientes = [
    { id: 1, cpf: '111.111.111-11', cnpj: null }, // Apenas CPF
    { id: 2, cpf: '222.222.222-22', cnpj: null }, // Apenas CPF
    { id: 3, cpf: null, cnpj: '11.111.111/0001-11' }, // Apenas CNPJ
    { id: 4, cpf: '444.444.444-44', cnpj: '44.444.444/0001-44' }, // Ambos
    { id: 5, cpf: null, cnpj: null }, // Sem doc
    { id: 6, cpf: '', cnpj: '   ' }   // Sem doc
  ];

  const total = mockClientes.length;
  const cpfs = mockClientes.filter(c => c.cpf && c.cpf.trim()).length;
  const cnpjs = mockClientes.filter(c => c.cnpj && c.cnpj.trim()).length;
  const apenasCpf = mockClientes.filter(c => c.cpf && c.cpf.trim() && (!c.cnpj || !c.cnpj.trim())).length;
  const apenasCnpj = mockClientes.filter(c => (!c.cpf || !c.cpf.trim()) && c.cnpj && c.cnpj.trim()).length;
  const ambos = mockClientes.filter(c => c.cpf && c.cpf.trim() && c.cnpj && c.cnpj.trim()).length;
  const comDoc = mockClientes.filter(c => (c.cpf && c.cpf.trim()) || (c.cnpj && c.cnpj.trim())).length;
  const semDoc = total - comDoc;

  // Asserções Matemáticas
  assert.equal(cpfs, 3); // IDs 1, 2, 4
  assert.equal(cnpjs, 2); // IDs 3, 4
  assert.equal(apenasCpf, 2); // IDs 1, 2
  assert.equal(apenasCnpj, 1); // ID 3
  assert.equal(ambos, 1); // ID 4
  assert.equal(comDoc, 4); // IDs 1, 2, 3, 4
  assert.equal(semDoc, 2); // IDs 5, 6

  // Validação da soma de conjuntos disjuntos
  assert.equal(apenasCpf + apenasCnpj + ambos, comDoc, 'Subconjuntos disjuntos devem somar exatamente comDoc');
  assert.equal(comDoc + semDoc, total, 'Clientes com doc + sem doc devem somar exatamente o total');
  assert.equal(apenasCpf + apenasCnpj + ambos + semDoc, total, 'Todas as partições devem fechar 100% no total');
  assert.equal(apenasCpf + ambos, cpfs, 'Apenas CPF + Ambos deve igualar ao total de CPFs');
  assert.equal(apenasCnpj + ambos, cnpjs, 'Apenas CNPJ + Ambos deve igualar ao total de CNPJs');
});
