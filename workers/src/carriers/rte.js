/**
 * RTE / Rodonaves tracking adapter.
 *
 * Auth: OAuth2-style password grant.
 *   POST https://tracking-apigateway.rte.com.br/token
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: auth_type=DEV&grant_type=password&username=<user>&password=<pass>
 *   Returns a Bearer JWT valid for ~8h.
 *
 * Tracking:
 *   GET /api/v1/tracking?TaxIdRegistration=&InvoiceNumber=   (single shipment)
 *   GET /api/v1/tracking/batchByOccurrenceDate?TaxIdRegistration=&StartDate=&EndDate=&Page=
 *     (batch by CNPJ + occurrence-date window; window must be <= 190 days; paginated)
 */

const TOKEN_URL_DEFAULT = 'https://tracking-apigateway.rte.com.br/token';
const API_BASE_DEFAULT = 'https://tracking-apigateway.rte.com.br';

// Confirmed against real production data (Chapeco-SC delivery). Event
// codes without a confirmed example fall back to IN_TRANSIT.
const STATUS_MAP = {
  0: 'DISPATCHED',
  1: 'IN_TRANSIT',
  '1.1': 'IN_TRANSIT',
  2: 'IN_TRANSIT',
  3: 'OUT_FOR_DELIVERY',
  6: 'DELIVERED',
};

function normalizeRteStatus(eventCode) {
  const key = typeof eventCode === 'number' ? eventCode : String(eventCode);
  if (STATUS_MAP[key] !== undefined) {
    return STATUS_MAP[key];
  }
  if (STATUS_MAP[Number(key)] !== undefined) {
    return STATUS_MAP[Number(key)];
  }
  return 'IN_TRANSIT';
}

class RteClient {
  // Accepts either an explicit credentials object ({ username, password,
  // taxIdRegistration, ... } -- e.g. loaded from Supabase Vault via
  // carrierCredentials.js) or, for local/manual use, falls back to reading
  // RTE_* environment variables.
  constructor(config = {}) {
    const env = process.env;
    this.tokenUrl = config.tokenUrl || env.RTE_TOKEN_URL || TOKEN_URL_DEFAULT;
    this.apiBase = config.apiBase || env.RTE_API_BASE_URL || API_BASE_DEFAULT;
    this.username = config.username ?? env.RTE_USERNAME;
    this.password = config.password ?? env.RTE_PASSWORD;
    this.taxIdRegistration =
      config.taxIdRegistration ?? config.tax_id_registration ?? env.RTE_TAX_ID_REGISTRATION;
    this.timeoutMs = Number(config.timeoutMs || env.RTE_TIMEOUT_MS || 15000);

    this._token = null;
    this._tokenExpiresAt = 0;
  }

  assertConfigured() {
    const missing = [];
    if (!this.username) missing.push('RTE_USERNAME');
    if (!this.password) missing.push('RTE_PASSWORD');
    if (!this.taxIdRegistration) missing.push('RTE_TAX_ID_REGISTRATION');
    if (missing.length > 0) {
      const err = new Error(`RTE client not configured: missing ${missing.join(', ')}`);
      err.code = 'RTE_NOT_CONFIGURED';
      throw err;
    }
  }

  async _fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') {
        const err = new Error(`RTE request timed out after ${this.timeoutMs}ms`);
        err.code = 'RTE_TIMEOUT';
        throw err;
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeout);
    }
  }

  async _authenticate() {
    this.assertConfigured();

    const body = new URLSearchParams({
      auth_type: 'DEV',
      grant_type: 'password',
      username: this.username,
      password: this.password,
    });

    const response = await this._fetchWithTimeout(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (parseErr) {
      const err = new Error(`RTE token endpoint returned non-JSON: ${text.slice(0, 300)}`);
      err.code = 'RTE_INVALID_TOKEN_RESPONSE';
      throw err;
    }

    if (!response.ok) {
      const err = new Error(
        `RTE auth HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`
      );
      err.code = 'RTE_AUTH_ERROR';
      err.status = response.status;
      err.body = payload;
      throw err;
    }

    const accessToken = payload.access_token || payload.accessToken || payload.token;
    if (!accessToken) {
      const err = new Error('RTE auth response did not include an access token');
      err.code = 'RTE_AUTH_NO_TOKEN';
      err.body = payload;
      throw err;
    }

    const expiresInSeconds = Number(payload.expires_in || payload.expiresIn || 28800);
    // Refresh 5 minutes before actual expiry to avoid races.
    this._token = accessToken;
    this._tokenExpiresAt = Date.now() + (expiresInSeconds - 300) * 1000;

    return this._token;
  }

  async _getToken() {
    if (this._token && Date.now() < this._tokenExpiresAt) {
      return this._token;
    }
    return this._authenticate();
  }

  async _authorizedGet(path, params) {
    const token = await this._getToken();
    const query = new URLSearchParams(params).toString();
    const url = `${this.apiBase}${path}${query ? `?${query}` : ''}`;

    const response = await this._fetchWithTimeout(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch (parseErr) {
      const err = new Error(`RTE returned non-JSON response: ${text.slice(0, 300)}`);
      err.code = 'RTE_INVALID_RESPONSE';
      throw err;
    }

    if (!response.ok) {
      const err = new Error(`RTE HTTP ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
      err.code = 'RTE_HTTP_ERROR';
      err.status = response.status;
      err.body = body;
      throw err;
    }

    return body;
  }

  /** Query a single shipment by invoice key, or by tax-id + invoice number. */
  async fetchTracking({ invoiceKey, invoiceNumber, taxIdRegistration } = {}) {
    const params = {};
    if (invoiceKey) {
      params.InvoiceKey = invoiceKey;
    } else if (invoiceNumber) {
      params.TaxIdRegistration = taxIdRegistration || this.taxIdRegistration;
      params.InvoiceNumber = invoiceNumber;
    } else {
      const err = new Error('fetchTracking requires invoiceKey or invoiceNumber');
      err.code = 'RTE_MISSING_QUERY_PARAMS';
      throw err;
    }
    return this._authorizedGet('/api/v1/tracking', params);
  }

  /**
   * Batch query by occurrence date window (max 190 days). Handles pagination
   * by fetching until the response reports no further pages.
   */
  async fetchBatchByOccurrenceDate({ startDate, endDate, taxIdRegistration } = {}) {
    const results = [];
    let page = 1;
    // Safety cap in case the API's pagination metadata is unexpected.
    const maxPages = 200;

    while (page <= maxPages) {
      const body = await this._authorizedGet('/api/v1/tracking/batchByOccurrenceDate', {
        TaxIdRegistration: taxIdRegistration || this.taxIdRegistration,
        StartDate: startDate,
        EndDate: endDate,
        Page: page,
      });

      const items =
        body.Items || body.items || body.Data || body.data || (Array.isArray(body) ? body : []);
      results.push(...items);

      const totalPages = body.TotalPages || body.totalPages;
      const hasMore = totalPages ? page < totalPages : items.length > 0 && body.HasNextPage;

      if (!hasMore) {
        break;
      }
      page += 1;
    }

    return results;
  }
}

function extractRteEvents(shipmentRecord) {
  // Confirmed real field name (from live API responses): "Events".
  const occurrences =
    shipmentRecord.Events ||
    shipmentRecord.events ||
    shipmentRecord.Occurrences ||
    shipmentRecord.occurrences ||
    [];

  return occurrences.map((evt) => {
    const code = evt.EventCode ?? evt.OccurrenceCode ?? evt.eventCode ?? evt.code;
    // RTE's "OccurrenceDate" field is unreliable in practice (observed as a
    // zero/min-date placeholder, e.g. "0001-01-01T00:00:00..."); "Date"
    // carries the real event timestamp, so it takes priority.
    const occurredAt =
      evt.Date || evt.EventDate || evt.occurredAt || evt.date || evt.OccurrenceDate;
    // HistoricId alone is not a reliable dedup key: the same HistoricId can
    // repeat across several distinct real-world updates (observed: three
    // separate "em transito" events all carrying HistoricId 1, each with a
    // different real Date). Combine it with the real Date to get a stable,
    // unique id per event.
    const historicId = evt.HistoricId ?? evt.historicId ?? 'x';

    return {
      id: `rte-${code}-${historicId}-${occurredAt}`,
      status: normalizeRteStatus(code),
      occurredAt,
      raw: evt,
    };
  });
}

/** Extracts the document numbers usable to match a batch record to a shipment. */
function extractRteShipmentKeys(shipmentRecord) {
  const cteNumber = shipmentRecord.CTeNumber || shipmentRecord.cteNumber || null;
  const invoiceNumbers = []
    .concat(shipmentRecord.FiscalDocumentNumber || [])
    .concat(shipmentRecord.ListFiscalDocument || [])
    .concat(shipmentRecord.InvoiceNumber || [])
    .flat()
    .filter(Boolean)
    .map(String);

  return { cteNumber: cteNumber ? String(cteNumber) : null, invoiceNumbers };
}

export {
  STATUS_MAP,
  normalizeRteStatus,
  RteClient,
  extractRteEvents,
  extractRteShipmentKeys,
};
