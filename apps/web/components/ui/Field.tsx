import type { ReactNode } from 'react';

// Campo de formulário com rótulo visível (placeholders sozinhos somem ao digitar).
// Use group para controles compostos (botões/listas), que não podem ficar dentro de <label>.
export function Field({ label, required, hint, className, group, children }: { label: string; required?: boolean; hint?: string; className?: string; group?: boolean; children: ReactNode }) {
  const inner = (
    <>
      <span>{label}{required ? <em> *</em> : null}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </>
  );
  return group
    ? <div className={`field ${className || ''}`} role="group" aria-label={label}>{inner}</div>
    : <label className={`field ${className || ''}`}>{inner}</label>;
}
