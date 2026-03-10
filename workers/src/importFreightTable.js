export function parseFreightWorkbook(workbook) {
  const requiredSheets = ['Configurações', 'Tipo de carga', 'Rotas'];
  const missing = requiredSheets.filter((sheet) => !workbook[sheet]);
  if (missing.length) {
    return { ok: false, errors: missing.map((name) => `Aba ausente: ${name}`) };
  }

  const routes = (workbook['Rotas'] || []).map((row, index) => ({
    line: index + 2,
    cep_start: row['CEP inicial'],
    cep_end: row['CEP final'],
    min_weight: Number(row['Peso inicial'] || 0),
    max_weight: Number(row['Peso final'] || 0),
    base_amount: Number(row['Valor base'] || 0)
  }));

  return { ok: true, data: { config: workbook['Configurações'][0], routes } };
}
