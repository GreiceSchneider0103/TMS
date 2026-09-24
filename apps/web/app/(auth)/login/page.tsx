'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setSession } from '@/services/session';
import { translateError } from '@/services/api';
import { Field } from '@/components/ui/Field';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export default function LoginPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed) return setError('Informe sua chave de acesso.');
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: trimmed })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) throw new Error(translateError(data?.error, res.status === 401 ? undefined : res.status));
      setSession(trimmed, data?.role);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err?.message === 'Failed to fetch' ? translateError('Failed to fetch') : err?.message || 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <span className="brand-mark">L</span>
          <div>
            <strong>TMS Lessul</strong>
            <span>Gestão de transportes</span>
          </div>
        </div>
        <div>
          <h1>Entrar</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Use a chave de acesso fornecida pelo administrador.</p>
        </div>
        <Field label="Chave de acesso">
          <input className="input" type="password" autoComplete="current-password" placeholder="tms_..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} disabled={busy} autoFocus />
        </Field>
        {error ? <div className="notice err">{error}</div> : null}
        <button className="btn primary" type="submit" disabled={busy} style={{ minHeight: 42 }}>{busy ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </div>
  );
}
