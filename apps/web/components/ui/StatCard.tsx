export function StatCard({ title, value, tone = 'neutral' }: { title: string; value: string | number; tone?: 'neutral' | 'success' | 'warning' | 'error' | 'info' }) {
  return (
    <div className="stat-card">
      <h4>{title}</h4>
      {tone === 'neutral' ? (
        <strong>{value}</strong>
      ) : (
        <strong className={`badge ${tone}`} style={{ border: 'none', background: 'transparent', padding: 0, fontSize: 34 }}>
          {value}
        </strong>
      )}
    </div>
  );
}
