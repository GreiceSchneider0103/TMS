'use client';
import { useEffect, useRef, useState } from 'react';

export type Option = { value: string; label: string };
export type Preset = { label: string; values: string[] };

// Seleção múltipla com busca e atalhos (ex.: regiões). Nada selecionado = "todos".
export function MultiSelect({ options, value, onChange, allLabel = 'Todos', presets = [], placeholder = 'Buscar...' }: {
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  allLabel?: string;
  presets?: Preset[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const selected = new Set(value);
  const toggle = (v: string) => onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  const togglePreset = (p: Preset) => {
    const allIn = p.values.every((v) => selected.has(v));
    onChange(allIn ? value.filter((v) => !p.values.includes(v)) : Array.from(new Set([...value, ...p.values])));
  };
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label || v;
  const summary = value.length === 0 ? allLabel : value.length <= 3 ? value.map(labelOf).join(', ') : `${value.length} selecionados`;
  const visible = options.filter((o) => o.label.toLowerCase().includes(term.toLowerCase()) || o.value.toLowerCase().includes(term.toLowerCase()));

  return (
    <div className="multi" ref={box}>
      <button type="button" className="select multi-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={value.length ? '' : 'muted'}>{summary}</span>
      </button>
      {open ? (
        <div className="multi-pop">
          {presets.length ? (
            <div className="chips" style={{ marginBottom: 8 }}>
              {presets.map((p) => {
                const active = p.values.every((v) => selected.has(v));
                return <button type="button" key={p.label} className={`chip ${active ? 'on' : ''}`} onClick={() => togglePreset(p)}>{p.label}</button>;
              })}
            </div>
          ) : null}
          {options.length > 8 ? <input className="input" placeholder={placeholder} value={term} onChange={(e) => setTerm(e.target.value)} style={{ marginBottom: 6 }} /> : null}
          <div className="multi-list">
            {visible.map((o) => (
              <label key={o.value} className="multi-item">
                <input type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)} />
                <span>{o.label}</span>
              </label>
            ))}
            {!visible.length ? <div className="muted small" style={{ padding: 6 }}>Nada encontrado.</div> : null}
          </div>
          <div className="multi-foot">
            <button type="button" className="btn ghost sm" onClick={() => onChange([])}>{allLabel} (limpar)</button>
            <button type="button" className="btn sm" onClick={() => onChange(options.map((o) => o.value))}>Marcar todos</button>
            <button type="button" className="btn primary sm" onClick={() => setOpen(false)}>OK</button>
          </div>
        </div>
      ) : null}
      {value.length > 3 ? (
        <div className="chips" style={{ marginTop: 6 }}>
          {value.map((v) => <span key={v} className="badge info" style={{ cursor: 'pointer' }} onClick={() => toggle(v)} title="Remover">{labelOf(v)} ×</span>)}
        </div>
      ) : null}
    </div>
  );
}
