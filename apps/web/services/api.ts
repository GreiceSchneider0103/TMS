import { AnyObj } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export function getSession() {
  if (typeof window === 'undefined') return { apiKey: '', email: '' };
  return {
    apiKey: localStorage.getItem('tms_api_key') || '',
    email: localStorage.getItem('tms_email') || ''
  };
}

export async function api<T = AnyObj>(path: string, init?: RequestInit): Promise<T> {
  const { apiKey } = getSession();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'x-correlation-id': crypto.randomUUID(),
      ...(init?.headers || {})
    },
    cache: 'no-store'
  });
  const data = await res.json();
  if (!res.ok || data?.error) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}
