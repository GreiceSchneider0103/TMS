'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function Topbar() {
  const router = useRouter();
  const [term, setTerm] = useState('');

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = term.trim();
    if (!trimmed) return;
    router.push(`/orders?status=&carrier=&from=&to=&q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <header className="topbar">
      <form onSubmit={submitSearch} style={{ flex: 1 }}>
        <input
          className="search"
          placeholder="🔍  Buscar pedido por número/ID..."
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </form>
      <div className="topbar-right">
        <span className="avatar">TMS</span>
      </div>
    </header>
  );
}
