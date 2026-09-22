export function downloadCsv(fileName: string, rows: any[]) {
  if (!rows || !rows.length) return;
  const headers: string[] = Array.from(rows.reduce((set: Set<string>, row) => {
    Object.keys(row || {}).forEach((k) => set.add(k));
    return set;
  }, new Set<string>()));

  const escape = (value: any) => {
    if (value === null || value === undefined) return '';
    const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const lines = [headers.join(','), ...rows.map((row) => headers.map((h) => escape(row[h])).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
