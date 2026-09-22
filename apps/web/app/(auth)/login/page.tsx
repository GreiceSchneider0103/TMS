'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!apiKey.trim()) return alert('Informe a API key.');
    setBusy(true);
    try {
      const res = await fetch('/api/session/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Falha no login');
      }
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
