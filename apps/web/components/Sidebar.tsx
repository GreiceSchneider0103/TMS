'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const links = [
  ['Dashboard', '/dashboard'],
  ['Pedidos', '/orders'],
  ['Cotação', '/quotes'],
  ['Embarques', '/shipments'],
  ['Tracking', '/tracking'],
  ['Cadastros', '/cadastros'],
  ['Frete', '/freight'],
  ['Logs', '/logs']
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="sidebar">
      <h2>TMS Homolog</h2>
      {links.map(([label, href]) => (
        <Link key={href} href={href} style={{ background: pathname.startsWith(href) ? '#334155' : 'transparent' }}>
          {label}
        </Link>
      ))}
      <button
        onClick={() => {
          document.cookie = 'tms_session=; Max-Age=0; path=/';
          localStorage.removeItem('tms_api_key');
          localStorage.removeItem('tms_email');
          router.push('/login');
        }}
      >
        Sair
      </button>
    </aside>
  );
}
