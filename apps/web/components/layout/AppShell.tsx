'use client';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from './Topbar';

export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  // Fecha o menu lateral (mobile) ao trocar de página.
  useEffect(() => setNavOpen(false), [pathname]);

  return (
    <div className={`app-shell ${navOpen ? 'nav-open' : ''}`}>
      <Sidebar onNavigate={() => setNavOpen(false)} />
      <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} />
      <div className="main">
        <Topbar onMenu={() => setNavOpen((v) => !v)} />
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
