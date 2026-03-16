'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');

  return (
    <div style={{ maxWidth: 420, margin: '80px auto' }} className="card">
      <h1>Login operacional</h1>
      <p>Use email/senha para sessão e API key para chamadas da API.</p>
      <div className="grid">
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <input placeholder="x-api-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        <button
          onClick={() => {
            if (!email || !password || !apiKey) return alert('Preencha email, senha e api key');
            fetch('/api/session/login', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ email, password, apiKey })
            })
              .then(async (res) => {
                if (!res.ok) {
                  const data = await res.json();
                  throw new Error(data.error || 'Falha no login');
                }
                router.push('/dashboard');
              })
              .catch((err) => alert(err.message));
          }}
        >
          Entrar
        </button>
      </div>
    </div>
  );
}
