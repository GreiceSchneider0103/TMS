'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const links = [
  ['Dashboard', '/dashboard', '◻️'],
  ['Pedidos', '/orders', '📦'],
  ['Cotações', '/quotes', '🧾'],
  ['Embarques', '/shipments', '🚚'],
  ['Tracking', '/tracking', '📍'],
  ['Cadastros', '/cadastros', '🗂️'],
  ['Frete', '/freight', '📋'],
  ['Regras de Frete', '/shipping-rules', '％'],
  ['Auditoria', '/audit', '🛡️'],
  ['Logs', '/logs', '📄'],
  ['Configurações', '/settings', '⚙️']
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>TMS Logistics</h1>
        <p>Transportation Management</p>
      </div>

      {links.map(([label, href, icon]) => (
        <Link key={href} href={href} className={`nav-link ${pathname.startsWith(href) ? 'active' : ''}`}>
          <span>{icon}</span>
          <span>{label}</span>
        </Link>
      ))}

      <div className="nav-spacer" />

      <button
        className="logout-btn"
        onClick={() => {
          fetch('/api/session/logout', { method: 'POST' }).finally(() => router.push('/login'));
        }}
      >
        Sair
      </button>
    </aside>
  );
}
