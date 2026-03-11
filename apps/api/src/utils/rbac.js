import { HttpError } from './router.js';

export const ROLE_ALIASES = {
  admin: 'admin',
  operador: 'operador_logistico',
  operador_logistico: 'operador_logistico',
  financeiro: 'financeiro',
  analista_integracao: 'analista_integracao',
  integracao: 'analista_integracao',
  visualizador: 'visualizador'
};

export function normalizeRole(role) {
  return ROLE_ALIASES[String(role || '').toLowerCase()] || 'visualizador';
}

export function authorizeRole(ctxRole, allowedRoles) {
  const normalized = normalizeRole(ctxRole);
  const allowed = new Set(allowedRoles.map(normalizeRole));
  if (normalized !== 'admin' && !allowed.has(normalized)) {
    throw new HttpError(403, `Forbidden for role ${normalized}`);
  }
  return normalized;
}
