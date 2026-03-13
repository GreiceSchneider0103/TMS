import { AnyObj } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export function getSession() {
  if (typeof window === 'undefined') return { apiKey: '', email: '' };
  return {
    apiKey: localStorage.getItem('tms_api_key') || '',
    email: localStorage.getItem('tms_email') || ''
  };
}

function correlationId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `cid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function api<T = AnyObj>(path: string, init?: RequestInit): Promise<T> {
  const { apiKey } = getSession();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'x-correlation-id': correlationId(),
      ...(init?.headers || {})
    },
    cache: 'no-store'
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok || (typeof data === 'object' && data && (data as AnyObj).error)) {
    const message = typeof data === 'object' && data ? (data as AnyObj).error : String(data);
    throw new Error(message || `HTTP ${res.status}`);
  }
  return data as T;
}
