'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getRole } from '@/services/session';
import { roleLabel } from '@/services/format';
import { Icon } from '@/components/ui/Icon';

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [role, setRole] = useState('');

  useEffect(() => setRole(getRole() || ''), []);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = term.trim();
    if (!trimmed) return;
    router.push(`/orders?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <header className="topbar">
      <button className="menu-btn" type="button" aria-label="Abrir menu" onClick={onMenu}>
        <Icon name="menu" />
      </button>
      <form onSubmit={submitSearch} role="search">
        <input
          className="search"
          type="search"
          placeholder="Buscar pedido pelo número..."
          aria-label="Buscar pedido"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </form>
      <div className="topbar-right">
        {role ? <span className="user-name">{roleLabel(role)}</span> : null}
        <span className="avatar">L</span>
      </div>
    </header>
  );
}
