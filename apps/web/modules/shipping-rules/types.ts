export type RuleType = 'Desconto' | 'Adicional';

export type ShippingRule = {
  id: string;
  name: string;
  description?: string;
  priority: number;
  active: boolean;
  validFrom?: string;
  validTo?: string;
  channel?: string;
  carrier?: string;
  service?: string;
  region?: string;
  actionType: string;
  value?: string;
  updatedAt: string;
  conditions?: Record<string, string>;
};
