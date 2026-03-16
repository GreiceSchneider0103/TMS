export class TinyTrackingClient {
  constructor({ baseUrl, token, timeoutMs = 15000, pathTemplate = '/shipments/{trackingCode}/events' }) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.timeoutMs = Number(timeoutMs);
    this.pathTemplate = pathTemplate;
  }

  assertConfigured() {
    if (!this.baseUrl || !this.token) {
      throw new Error('Tiny tracking client is not configured: set TINY_BASE_URL and TINY_API_TOKEN');
    }
  }

  async listTrackingEvents({ trackingCode, correlationId = null }) {
    this.assertConfigured();
    if (!trackingCode) return [];

    const path = this.pathTemplate.replace('{trackingCode}', encodeURIComponent(String(trackingCode)));
    const url = new URL(path, this.baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
          ...(correlationId ? { 'x-correlation-id': correlationId } : {})
        },
        signal: controller.signal
      });
      const body = await parseBody(response);
      if (!response.ok) {
        const err = new Error(`Tiny tracking list failed: ${response.status}`);
        err.code = 'TINY_TRACKING_HTTP_ERROR';
        err.providerStatus = response.status;
        err.providerBody = body;
        throw err;
      }

      return extractTrackingEvents(body).map((evt, idx) => normalizeTrackingEvent(evt, idx));
    } catch (error) {
      if (error?.name === 'AbortError') {
        const err = new Error(`Tiny tracking request timeout after ${this.timeoutMs}ms`);
        err.code = 'TINY_TRACKING_TIMEOUT';
        throw err;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function extractTrackingEvents(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const candidates = [
    payload.events,
    payload.data,
    payload?.retorno?.eventos,
    payload?.retorno?.eventos?.evento,
    payload?.retorno?.rastreamento,
    payload?.retorno?.rastreamento?.evento
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function normalizeTrackingEvent(raw, index = 0) {
  const evt = raw?.evento || raw;
  const status = firstNonEmpty(evt.status, evt.situacao, evt.descricao, 'in_transit');
  const occurredAt = firstNonEmpty(evt.occurredAt, evt.dataHora, evt.data, evt.created_at, new Date().toISOString());
  const id = String(firstNonEmpty(evt.id, evt.eventId, evt.codigo, `${status}-${occurredAt}-${index}`));

  return {
    id,
    status,
    occurredAt,
    raw: raw
  };
}

function firstNonEmpty(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return null;
}

async function parseBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
