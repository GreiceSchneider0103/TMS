import type { Option, Preset } from '@/components/ui/MultiSelect';

export const UF_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo',
  GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins'
};

export const UF_OPTIONS: Option[] = Object.keys(UF_NAMES).map((uf) => ({ value: uf, label: `${uf} · ${UF_NAMES[uf]}` }));

export const REGION_PRESETS: Preset[] = [
  { label: 'Norte', values: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'] },
  { label: 'Nordeste', values: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'] },
  { label: 'Centro-Oeste', values: ['DF', 'GO', 'MT', 'MS'] },
  { label: 'Sudeste', values: ['ES', 'MG', 'RJ', 'SP'] },
  { label: 'Sul', values: ['PR', 'RS', 'SC'] }
];

export const CHANNEL_OPTIONS: Option[] = [
  { value: 'shopee', label: 'Shopee' },
  { value: 'magalu', label: 'Magalu' },
  { value: 'tiny', label: 'Tiny ERP' },
  { value: 'mercadolivre', label: 'Mercado Livre' },
  { value: 'site', label: 'Site próprio' },
  { value: 'manual', label: 'Manual' }
];

// Descreve uma lista de UFs de forma curta, usando o nome da região quando ela está completa.
export function describeStates(states: string[]): string {
  if (!states.length) return 'Todas';
  if (states.length === 27) return 'Todas';
  const rest = new Set(states);
  const parts: string[] = [];
  for (const r of REGION_PRESETS) {
    if (r.values.every((v) => rest.has(v))) {
      parts.push(r.label);
      r.values.forEach((v) => rest.delete(v));
    }
  }
  return [...parts, ...Array.from(rest).sort()].join(', ');
}
