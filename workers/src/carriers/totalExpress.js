/**
 * Total Express (TEX Courier) tracking adapter.
 *
 * API: POST https://edi.totalexpress.com.br/previsao_entrega_atualizada.php
 * Auth: HTTP Basic Auth
 * Body: { remetenteId, pedido }  (pedido = numero da Nota Fiscal)
 *
 * Status codes below were confirmed against real production data
 * (NF 028987). Codes without a confirmed real-world example fall back
 * to keyword matching on the status text.
 */

const STATUS_MAP = {
  0: 'CREATED',
  97: 'DISPATCHED',
  83: 'DISPATCHED',
  68: 'IN_TRANSIT',
  101: 'IN_TRANSIT',
  78: 'IN_TRANSIT',
  102: 'IN_TRANSIT',
  79: 'IN_TRANSIT',
  103: 'IN_TRANSIT',
  108: 'IN_TRANSIT',
  159: 'IN_TRANSIT',
  160: 'IN_TRANSIT',
  105: 'IN_TRANSIT',
  104: 'OUT_FOR_DELIVERY',
  1: 'DELIVERED',
};

function normalizeTotalExpressStatus(statusid, statusText) {
  const id = Number(statusid);
  if (STATUS_MAP[id]) {
    return STATUS_MAP[id];
  }

  const text = String(statusText || '').toLowerCase();
  if (text.includes('devol')) {
    return 'RETURNED';
  }
  if (
    text.includes('extravio') ||
    text.includes('avaria') ||
    text.includes('recusa') ||
    text.includes('insucesso')
  ) {
    return 'EXCEPTION';
  }
  if (text.includes('entregue')) {
    return 'DELIVERED';
  }
  if (text.includes('saiu para entrega') || text.includes('rota de entrega')) {
    return 'OUT_FOR_DELIVERY';
  }

  return 'IN_TRANSIT';
}

class TotalExpressClient {
  // Accepts either an explicit credentials object ({ user, password,
  // remetenteId, baseUrl, timeoutMs } -- e.g. loaded from Supabase Vault via
  // carrierCredentials.js) or, for local/manual use, falls back to reading
  // TOTAL_EXPRESS_* environment variables.
  constructor(config = {}) {
    const env = process.env;
    this.baseUrl =
      config.baseUrl ||
      env.TOTAL_EXPRESS_BASE_URL ||
      'https://edi.totalexpress.com.br/previsao_entrega_atualizada.php';
    this.user = config.user ?? env.TOTAL_EXPRESS_USER;
    this.password = config.password ?? env.TOTAL_EXPRESS_PASSWORD;
    this.remetenteId = config.remetenteId ?? config.remetente_id ?? env.TOTAL_EXPRESS_REMETENTE_ID;
    this.timeoutMs = Number(config.timeoutMs || env.TOTAL_EXPRESS_TIMEOUT_MS || 15000);
  }

  assertConfigured() {
    const missing = [];
    if (!this.user) missing.push('TOTAL_EXPRESS_USER');
    if (!this.password) missing.push('TOTAL_EXPRESS_PASSWORD');
    if (!this.remetenteId) missing.push('TOTAL_EXPRESS_REMETENTE_ID');
    if (missing.length > 0) {
      const err = new Error(
        `Total Express client not configured: missing ${missing.join(', ')}`
      );
      err.code = 'TOTAL_EXPRESS_NOT_CONFIGURED';
      throw err;
    }
  }

  async fetchTracking({ numeroNF }) {
    this.assertConfigured();

    if (!numeroNF) {
      const err = new Error('numeroNF is required to query Total Express tracking');
      err.code = 'TOTAL_EXPRESS_MISSING_NF';
      throw err;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const authHeader =
      'Basic ' + Buffer.from(`${this.user}:${this.password}`).toString('base64');

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          remetenteId: this.remetenteId,
          // Total Express rejects the NF number with a leading zero
          // (e.g. "028987" -> 400 "Erro sistemico ao carregar dados do
          // cliente(b1)"); strip it defensively, keeping at least one digit.
          pedido: String(numeroNF).replace(/^0+(?=\d)/, ''),
        }),
        signal: controller.signal,
      });

      const text = await response.text();
      let body;
      try {
        body = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        const err = new Error(
          `Total Express returned non-JSON response: ${text.slice(0, 300)}`
        );
        err.code = 'TOTAL_EXPRESS_INVALID_RESPONSE';
        throw err;
      }

      if (!response.ok) {
        const err = new Error(
          `Total Express HTTP ${response.status}: ${JSON.stringify(body).slice(0, 300)}`
        );
        err.code = 'TOTAL_EXPRESS_HTTP_ERROR';
        err.status = response.status;
        err.body = body;
        throw err;
      }

      return body;
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') {
        const err = new Error(
          `Total Express request timed out after ${this.timeoutMs}ms`
        );
        err.code = 'TOTAL_EXPRESS_TIMEOUT';
        throw err;
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function extractTotalExpressEvents(trackingResponse) {
  const detalhes = trackingResponse && trackingResponse.detalhes;
  const statusList = (detalhes && detalhes.statusDeEncomenda) || [];

  return statusList.map((evt) => {
    const statusid = evt.statusid ?? evt.statusId ?? evt.status;
    const statusText = evt.status || evt.descricao || evt.statusDescricao || '';
    const occurredAt = evt.data || evt.dataHora || evt.dataOcorrencia || null;

    return {
      id: `te-${statusid}-${occurredAt}`,
      status: normalizeTotalExpressStatus(statusid, statusText),
      occurredAt,
      raw: evt,
    };
  });
}

export {
  STATUS_MAP,
  normalizeTotalExpressStatus,
  TotalExpressClient,
  extractTotalExpressEvents,
};
