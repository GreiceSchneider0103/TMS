import { AnyObj } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

function correlationId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `cid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function api<T = AnyObj>(path: string, init?: RequestInit): Promise<T> {
  const method = String(init?.method || 'GET').toUpperCase();
  const mutating = method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
  const idem = mutating ? correlationId() : null;

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-correlation-id': correlationId(),
      ...(idem ? { 'x-idempotency-key': idem } : {}),
      ...(init?.headers || {})
    },
    cache: 'no-store',
    credentials: 'include'
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok || (typeof data === 'object' && data && (data as AnyObj).error)) {
    const message = typeof data === 'object' && data ? (data as AnyObj).error : String(data);
    throw new Error(message || `HTTP ${res.status}`);
  }
  return data as T;
}
