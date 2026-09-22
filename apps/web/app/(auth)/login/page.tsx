'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setSession } from '@/services/session';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export default function LoginPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = apiKey.trim();
    if (!trimmed) return alert('Informe a API key.');
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/auth/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: trimmed })
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error || 'Falha no login');
      setSession(trimmed);
      router.push('/dashboard');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '80px auto' }} className="card">
      <h1>Login operacional</h1>
      <p>Autenticação por API key (x-api-key da conta).</p>
      <div className="grid">
        <input placeholder="x-api-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} disabled={busy} />
        <button onClick={submit} disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</button>
      </div>
    </div>
  );
}