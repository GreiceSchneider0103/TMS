import { ShippingRule } from './types';

export const MOCK_SHIPPING_RULES: ShippingRule[] = [
  { id: '1', name: 'Desconto Marketplace', priority: 1, active: true, channel: 'Mercado Livre', carrier: 'Todos', service: 'Todos', region: 'Sudeste', actionType: 'Desconto percentual', value: '-15%', updatedAt: '16/03/2026 14:30' },
  { id: '2', name: 'Taxa Área Remota', priority: 2, active: true, channel: 'Todos', carrier: 'Todos', service: 'Todos', region: 'Norte', actionType: 'Adicional fixo', value: '+R$ 25,00', updatedAt: '16/03/2026 13:10' },
  { id: '3', name: 'Frete Grátis SP', priority: 3, active: true, channel: 'E-commerce', carrier: 'Correios', service: 'PAC', region: 'SP - Capital', actionType: 'Frete grátis', value: '-100%', updatedAt: '15/03/2026 17:25' },
  { id: '4', name: 'Desconto Eletrônicos', priority: 4, active: false, channel: 'Todos', carrier: 'Todos', service: 'Todos', region: 'Todos', actionType: 'Desconto percentual', value: '-10%', updatedAt: '15/03/2026 12:00' }
];
