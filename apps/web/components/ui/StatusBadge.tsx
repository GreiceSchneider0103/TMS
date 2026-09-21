export function StatusBadge({ status }: { status?: string | null }) {
  const normalized = String(status || 'unknown').toLowerCase();
  let tone: 'success' | 'warning' | 'error' | 'info' | 'neutral' = 'neutral';

  if (['active', 'ativo', 'approved', 'aprovado', 'published', 'publicada', 'delivered', 'entregue', 'success'].includes(normalized)) tone = 'success';
  else if (['pending', 'pendente', 'retry', 'in_transit', 'em trânsito', 'draft', 'rascunho'].includes(normalized)) tone = 'warning';
  else if (['error', 'erro', 'rejected', 'rejeitado', 'inactive', 'inativo', 'failed'].includes(normalized)) tone = 'error';
  else if (['processing', 'processando', 'coletado'].includes(normalized)) tone = 'info';

  return <span className={`badge ${tone}`}>{status || 'N/A'}</span>;
}
