'use client';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function Modal({ title, onClose, size, children }: { title: string; onClose: () => void; size?: 'sm'; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size || ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="panel-head">
          <h3>{title}</h3>
          <button className="btn ghost sm" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>
        <div className="panel-body grid">{children}</div>
      </div>
    </div>
  );
}
