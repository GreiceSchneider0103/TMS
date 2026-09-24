'use client';
import { useState } from 'react';

// Mapa do Brasil em grade (cada UF é um quadrado na posição aproximada), com escala sequencial de uma cor.
const TILES: Record<string, [number, number]> = {
  RR: [2, 0], AP: [4, 0],
  AM: [1, 1], PA: [3, 1], MA: [5, 1], CE: [6, 1], RN: [7, 1],
  AC: [0, 2], RO: [1, 2], MT: [2, 2], TO: [3, 2], PI: [5, 2], PE: [6, 2], PB: [7, 2],
  GO: [3, 3], DF: [4, 3], BA: [5, 3], SE: [6, 3], AL: [7, 3],
  MS: [2, 4], SP: [3, 4], MG: [4, 4], ES: [5, 4],
  PR: [3, 5], RJ: [4, 5],
  SC: [3, 6],
  RS: [3, 7]
};
const RAMP = ['#cde2fb', '#9ec5f4', '#5598e7', '#256abf', '#104281'];

export function UfTileMap({ values, format, metricLabel, selected, onSelect, detail }: {
  values: Record<string, number>; format: (v: number) => string; metricLabel: string;
  selected?: string | null; onSelect?: (uf: string | null) => void; detail?: (uf: string) => string | null;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const nums = Object.values(values).filter((v) => v > 0);
  const max = nums.length ? Math.max(...nums) : 0;
  const bin = (v: number) => (v > 0 && max ? Math.min(RAMP.length - 1, Math.floor((v / max) * RAMP.length - 1e-9)) : -1);
  const limits = RAMP.map((_, i) => (max * (i + 1)) / RAMP.length);

  return (
    <div className="ufmap">
      <div className="ufmap-grid" role="img" aria-label={`Mapa por UF: ${metricLabel}`}>
        {Object.entries(TILES).map(([uf, [x, y]]) => {
          const v = values[uf] || 0;
          const b = bin(v);
          return (
            <button
              type="button"
              key={uf}
              className={`uf-tile ${selected === uf ? 'selected' : ''} ${b < 0 ? 'empty' : ''}`}
              style={{ gridColumn: x + 1, gridRow: y + 1, background: b < 0 ? undefined : RAMP[b], color: b >= 2 ? '#fff' : 'var(--text)' }}
              onMouseEnter={() => setHover(uf)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(uf)}
              onBlur={() => setHover(null)}
              onClick={() => onSelect?.(selected === uf ? null : uf)}
              aria-label={`${uf}: ${format(v)}`}
            >
              {uf}
            </button>
          );
        })}
        {hover ? (
          <div className="ufmap-tip">
            <strong>{hover}</strong> · {metricLabel}: {format(values[hover] || 0)}
            {detail?.(hover) ? <div className="muted small">{detail(hover)}</div> : null}
          </div>
        ) : null}
      </div>
      <div className="ufmap-legend" aria-label="Legenda">
        <span className="muted small">{metricLabel}</span>
        <div className="ufmap-scale">
          <span className="swatch empty" /> <small>sem dados</small>
          {RAMP.map((c, i) => <span key={c} className="swatch-wrap"><span className="swatch" style={{ background: c }} /><small>{max ? `até ${format(limits[i])}` : ''}</small></span>)}
        </div>
      </div>
    </div>
  );
}
