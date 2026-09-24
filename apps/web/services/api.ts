import { AnyObj } from './types';
import { clearSession, getApiKey } from './session';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

function correlationId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `cid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function api<T = AnyObj>(path: string, init?: RequestInit): Promise<T> {
  const method = String(init?.method || 'GET').toUpperCase();
  const mutating = method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
  const idem = mutating ? correlationId() : null;
  const apiKey = getApiKey();

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': correlationId(),
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
        ...(idem ? { 'x-idempotency-key': idem } : {}),
        ...(init?.headers || {})
      },
      cache: 'no-store'
    });
  } catch {
    throw new Error(translateError('Failed to fetch'));
  }

  // Sessão perdida (ex.: aba nova sem a chave no sessionStorage): volta para o login em vez de mostrar erros em todas as telas.
  if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    clearSession();
    window.location.href = '/login';
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok || (typeof data === 'object' && data && (data as AnyObj).error)) {
    const raw = typeof data === 'object' && data ? String((data as AnyObj).error || '') : '';
    throw new Error(translateError(raw, res.status));
  }
  return data as T;
}

const FIELD_NAMES: Record<string, string> = {
  name: 'Nome', cnpj: 'CNPJ', tradeName: 'Nome fantasia', legalName: 'Razão social', postalCode: 'CEP', city: 'Cidade',
  state: 'UF', addressLine: 'Endereço', document: 'CPF/CNPJ', type: 'Tipo', skuInternal: 'SKU interno', priority: 'Prioridade',
  companyId: 'Empresa', carrierId: 'Transportadora', slaDays: 'Prazo', label: 'Nome', role: 'Perfil', tableName: 'Nome da tabela'
};

const KNOWN_ERRORS: Record<string, string> = {
  'Failed to fetch': 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
  Forbidden: 'Você não tem permissão para executar esta ação.',
  'Payload too large': 'O arquivo é grande demais para ser enviado.',
  'Invalid API key': 'Chave de acesso inválida ou revogada.',
  'Invalid token': 'Chave de acesso inválida.',
  'Invalid JSON body': 'Dados enviados em formato inválido.',
  'Order not found': 'Pedido não encontrado.',
  'Shipment not found': 'Embarque não encontrado.',
  'Quote result not found': 'Cotação não encontrada.',
  'Version not found': 'Versão da tabela não encontrada.',
  'Shipping rule not found': 'Regra de frete não encontrada.',
  'Recipient not found': 'Destinatário não encontrado.',
  'Product not found': 'Produto não encontrado.',
  'Product not found or inactive': 'Produto não encontrado ou inativo.',
  'Product logistics not found': 'Dados logísticos do produto não encontrados.',
  'Distribution center not found': 'Centro de distribuição não encontrado.',
  'Company not found': 'Empresa não encontrada.',
  'Company not found or inactive': 'Empresa não encontrada ou inativa.',
  'Carrier not found': 'Transportadora não encontrada.',
  'Carrier not found or inactive': 'Transportadora não encontrada ou inativa.',
  'Carrier service not found': 'Serviço de transportadora não encontrado.',
  'API credential not found': 'Chave de API não encontrada.',
  'Shopee shop not connected': 'A loja Shopee deste pedido não está conectada.',
  'Order is not a Shopee order': 'Este pedido não é da Shopee.',
  'Order is missing Shopee shop/order reference': 'Pedido sem referência da loja/pedido na Shopee.',
  'Unexpected error': 'Ocorreu um erro inesperado. Tente novamente.'
};

export function translateError(message?: string, status?: number): string {
  const msg = String(message || '').trim();
  if (KNOWN_ERRORS[msg]) return KNOWN_ERRORS[msg];
  if (/^Unauthorized/i.test(msg) || status === 401) return 'Sua sessão expirou. Faça login novamente.';
  if (status === 429 || /too many requests|rate limit/i.test(msg)) return 'Muitas requisições em sequência. Aguarde alguns segundos e tente novamente.';

  let m = msg.match(/^(\w+) is required$/);
  if (m) return `O campo "${FIELD_NAMES[m[1]] || m[1]}" é obrigatório.`;
  m = msg.match(/^(\w+) cannot be empty$/);
  if (m) return `O campo "${FIELD_NAMES[m[1]] || m[1]}" não pode ficar vazio.`;
  m = msg.match(/^(\w+) must have (\d+) (digits|characters)$/);
  if (m) return `O campo "${FIELD_NAMES[m[1]] || m[1]}" deve ter ${m[2]} ${m[3] === 'digits' ? 'dígitos' : 'caracteres'}.`;
  if (/^document must have/.test(msg)) return 'O CPF/CNPJ deve ter 11 ou 14 dígitos.';
  if (/^type must be PF or PJ/.test(msg)) return 'O tipo deve ser PF ou PJ.';
  if (/^priority must be/.test(msg)) return 'A prioridade deve ser um número inteiro maior ou igual a zero.';
  if (/duplicate key|already exists/i.test(msg)) return 'Já existe um registro com esses dados.';
  if (/invalid input syntax for type uuid/i.test(msg)) return 'Identificador inválido.';

  if (!msg) return status && status >= 500 ? 'Erro no servidor. Tente novamente em instantes.' : 'Ocorreu um erro inesperado.';
  // Mensagens que o servidor já envia em português passam direto; demais erros técnicos viram mensagem genérica.
  if (/[ãõçéêáíóú]/i.test(msg) || /^(CEP|Peso|Tiny|Informe|Falha)/.test(msg)) return msg;
  if (typeof console !== 'undefined') console.warn('[TMS] erro da API:', status, msg);
  return status && status >= 500 ? 'Erro no servidor. Tente novamente em instantes.' : 'Não foi possível concluir a operação. Verifique os dados e tente novamente.';
}
