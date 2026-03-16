import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

export function PrivateShell({ children }: { children: ReactNode }) {
  return (
    <div className="layout">
      <Sidebar />
      <main className="content">{children}</main>
    </div>
  );
}
