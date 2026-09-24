'use client';
import { useState } from 'react';

// Barras verticais de uma série só (uma cor), com dica ao passar o mouse.
export function BarChart({ data, height = 160, format = (v: number) => String(v), label }: {
  data: { label: string; value: number }[]; height?: number; format?: (v: number) => string; label: string;
}) {
  const tick = (v: number) => new Intl.NumberFormat('pt-BR').format(v);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = [0, Math.round(max / 2), max];
  const W = 100 / Math.max(1, data.length);

  return (
    <div className="chart" role="img" aria-label={label}>
      <div className="chart-plot" style={{ height }}>
        <div className="chart-grid">{ticks.slice().reverse().map((t) => <div key={t}><span>{tick(t)}</span></div>)}</div>
        <div className="chart-bars">
          {data.map((d, i) => (
            <div key={d.label} className="chart-slot" style={{ width: `${W}%` }} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <div className={`chart-bar ${hover === i ? 'hover' : ''}`} style={{ height: `${(d.value / max) * 100}%` }} />
              {hover === i ? <div className="chart-tip"><strong>{format(d.value)}</strong><span>{d.label}</span></div> : null}
            </div>
          ))}
        </div>
      </div>
      <div className="chart-axis">{data.map((d) => <span key={d.label} style={{ width: `${W}%` }}>{d.label}</span>)}</div>
    </div>
  );
}
