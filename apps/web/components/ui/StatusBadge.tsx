import { statusInfo } from '@/services/format';

export function StatusBadge({ status }: { status?: string | null }) {
  const { label, tone } = statusInfo(status);
  return <span className={`badge ${tone}`}>{label}</span>;
}
