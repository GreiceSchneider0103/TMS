import { HttpError } from './router.js';

export function parseIsoDateOrDefault(value, fallback, fieldName) {
  if (value === undefined || value === null || value === '') return fallback;
  const str = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    throw new HttpError(400, `${fieldName} must be YYYY-MM-DD`);
  }
  return str;
}

export function parseOptionalUuid(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const str = String(value).trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(str)) {
    throw new HttpError(400, `${fieldName} must be a valid UUID`);
  }
  return str;
}

export function parseIntWithBounds(value, fallback, { fieldName, min = 0, max = 1000 } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new HttpError(400, `${fieldName} must be an integer`);
  if (parsed < min || parsed > max) throw new HttpError(400, `${fieldName} must be between ${min} and ${max}`);
  return parsed;
}
