'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearSession } from '@/services/session';
import { Icon } from '@/components/ui/Icon';

const sections: { title: string; links: [string, string, string][] }[] = [
  {
    title: 'Operação',
    links: [
      ['Painel', '/dashboard', 'dashboard'],
      ['Pedidos', '/orders', 'orders'],
      ['Cotações', '/quotes', 'quotes'],
      ['Embarques', '/shipments', 'shipments'],
      ['Rastreamento', '/tracking', 'tracking']
    ]
  },
  {
    title: 'Frete',
    links: [
      ['Tabelas de frete', '/freight', 'freight'],
      ['Regras de frete', '/shipping-rules', 'rules'],
      ['Auditoria de frete', '/audit', 'audit']
    ]
  },
  {
    title: 'Administração',
    links: [
      ['Cadastros', '/cadastros', 'registry'],
      ['Logs', '/logs', 'logs'],
      ['Configurações', '/settings', 'settings']
    ]
  }
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">L</span>
        <div>
          <strong>TMS Lessul</strong>
          <span>Gestão de transportes</span>
        </div>
      </div>

      {sections.map((section) => (
        <nav key={section.title} aria-label={section.title}>
          <div className="nav-section">{section.title}</div>
          {section.links.map(([label, href, icon]) => (
            <Link key={href} href={href} onClick={onNavigate} className={`nav-link ${pathname.startsWith(href) ? 'active' : ''}`}>
              <Icon name={icon} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      ))}

      <div className="nav-spacer" />

      <button
        className="logout-btn"
        onClick={() => {
          clearSession();
          router.push('/login');
        }}
      >
        <Icon name="logout" />
        Sair
      </button>
    </aside>
  );
}
