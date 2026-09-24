import type { ReactNode } from 'react';

// Campo de formulário com rótulo visível (placeholders sozinhos somem ao digitar).
export function Field({ label, required, hint, className, children }: { label: string; required?: boolean; hint?: string; className?: string; children: ReactNode }) {
  return (
    <label className={`field ${className || ''}`}>
      <span>{label}{required ? <em> *</em> : null}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}
