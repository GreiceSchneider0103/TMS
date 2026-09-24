import { formatDateTime } from '@/services/format';

export type ShippingRule = {
  id: string;
  name: string;
  description?: string;
  priority: number;
  active: boolean;
  validFrom?: string;
  validTo?: string;
  // Listas vazias = vale para todos.
  channels: string[];
  carriers: string[];
  states: string[];
  actionType: string;
  value?: string; // valor numérico da ação
  actionCarriers: string[]; // transportadoras de "Bloquear"/"Priorizar"
  updatedAt: string;
  conditions: Record<string, string>;
};

export const ACTION_OPTIONS = [
  'Frete grátis', 'Desconto percentual', 'Desconto fixo', 'Adicional percentual', 'Adicional fixo',
  'Bloquear transportadora', 'Priorizar transportadora', 'Adicionar prazo', 'Aplicar mínimo', 'Aplicar máximo'
] as const;

export const CARRIER_ACTIONS = ['Bloquear transportadora', 'Priorizar transportadora'];

const list = (v: unknown): string[] => (v === undefined || v === null || v === '' ? [] : (Array.isArray(v) ? v : [v]).map(String).filter(Boolean));

export function ruleToApiPayload(rule: ShippingRule) {
  const c = rule.conditions || {};
  const conditions: Record<string, any> = {};
  if (rule.channels.length) conditions.channels = rule.channels;
  if (rule.carriers.length) conditions.carrier_ids = rule.carriers;
  if (rule.states.length) conditions.states = rule.states;
  if (c.city) conditions.city = c.city;
  if (c.sku) conditions.sku = c.sku;
  if (c.category) conditions.category = c.category;
  if (c.customerType && c.customerType !== 'PF/PJ') conditions.recipient_type = c.customerType;
  if (c.cepRange?.includes('-')) {
    const [start, end] = c.cepRange.split('-').map((x) => x.trim().replace(/\D/g, ''));
    conditions.cep_start = start;
    conditions.cep_end = end;
  }
  if (c.weightRange?.includes('-')) {
    const [min, max] = c.weightRange.split('-').map((x) => Number(x.trim().replace(',', '.')));
    conditions.min_weight = min;
    conditions.max_weight = max;
  }
  if (c.orderValueRange?.includes('-')) {
    const [min, max] = c.orderValueRange.split('-').map((x) => Number(x.trim().replace(',', '.')));
    conditions.min_invoice_amount = min;
    conditions.max_invoice_amount = max;
  }

  const actions: Record<string, any> = {};
  const value = Number(String(rule.value || '').replace(',', '.'));
  switch (rule.actionType) {
    case 'Frete grátis': actions.discount_percent = 100; break;
    case 'Desconto percentual': actions.discount_percent = value; break;
    case 'Desconto fixo': actions.discount_fixed = value; break;
    case 'Adicional percentual': actions.additional_percent = value; break;
    case 'Adicional fixo': actions.additional_fixed = value; break;
    case 'Bloquear transportadora': actions.block_carriers = rule.actionCarriers; break;
    case 'Priorizar transportadora': actions.prioritize_carriers = rule.actionCarriers; break;
    case 'Adicionar prazo': actions.add_days = value; break;
    case 'Aplicar mínimo': actions.min_amount = value; break;
    case 'Aplicar máximo': actions.max_amount = value; break;
  }

  return {
    name: rule.name,
    description: rule.description || null,
    priority: Number(rule.priority) || 100,
    active: Boolean(rule.active),
    validFrom: rule.validFrom || null,
    validTo: rule.validTo || null,
    conditions,
    actions
  };
}

// Converte o registro da API (formato novo com listas ou antigo com valor único) para o formulário.
export function apiRuleToRule(row: any): ShippingRule {
  const actions = row.actions || {};
  const conditions = row.conditions || {};
  let actionType = ACTION_OPTIONS[0] as string;
  let value = '';
  let actionCarriers: string[] = [];
  if (actions.discount_percent === 100) { actionType = 'Frete grátis'; }
  else if (actions.discount_percent !== undefined) { actionType = 'Desconto percentual'; value = String(actions.discount_percent); }
  else if (actions.discount_fixed !== undefined) { actionType = 'Desconto fixo'; value = String(actions.discount_fixed); }
  else if (actions.additional_percent !== undefined) { actionType = 'Adicional percentual'; value = String(actions.additional_percent); }
  else if (actions.additional_fixed !== undefined) { actionType = 'Adicional fixo'; value = String(actions.additional_fixed); }
  else if (actions.block_carriers !== undefined || actions.block_carrier !== undefined) { actionType = 'Bloquear transportadora'; actionCarriers = list(actions.block_carriers ?? actions.block_carrier); }
  else if (actions.prioritize_carriers !== undefined || actions.prioritize_carrier !== undefined) { actionType = 'Priorizar transportadora'; actionCarriers = list(actions.prioritize_carriers ?? actions.prioritize_carrier); }
  else if (actions.add_days !== undefined) { actionType = 'Adicionar prazo'; value = String(actions.add_days); }
  else if (actions.min_amount !== undefined) { actionType = 'Aplicar mínimo'; value = String(actions.min_amount); }
  else if (actions.max_amount !== undefined) { actionType = 'Aplicar máximo'; value = String(actions.max_amount); }

  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    priority: row.priority,
    active: row.active,
    validFrom: row.valid_from ? String(row.valid_from).slice(0, 10) : '',
    validTo: row.valid_to ? String(row.valid_to).slice(0, 10) : '',
    channels: list(conditions.channels ?? conditions.channel).map((c) => c.toLowerCase()),
    carriers: list(conditions.carrier_ids ?? conditions.carrier_id),
    states: list(conditions.states ?? conditions.state).map((s) => s.toUpperCase()),
    actionType,
    value,
    actionCarriers,
    updatedAt: formatDateTime(row.updated_at || row.created_at),
    conditions: {
      cepRange: conditions.cep_start && conditions.cep_end ? `${conditions.cep_start}-${conditions.cep_end}` : '',
      city: conditions.city || '',
      sku: conditions.sku || '',
      category: conditions.category || '',
      weightRange: conditions.min_weight !== undefined ? `${conditions.min_weight}-${conditions.max_weight}` : '',
      orderValueRange: conditions.min_invoice_amount !== undefined ? `${conditions.min_invoice_amount}-${conditions.max_invoice_amount}` : '',
      customerType: conditions.recipient_type || 'PF/PJ'
    }
  };
}
