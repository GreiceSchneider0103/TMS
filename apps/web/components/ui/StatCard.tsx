import type { Tone } from '@/services/format';

export function StatCard({ title, value, tone = 'neutral' }: { title: string; value: string | number; tone?: Tone }) {
  return (
    <div className={`stat-card ${tone}`}>
      <h4>{title}</h4>
      <strong>{value}</strong>
    </div>
  );
}
