'use client';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProductImport } from './ProductImport';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { channelLabel, formatCep, formatDocument, formatNumber } from '@/services/format';
import { CHANNEL_OPTIONS } from '@/services/brazil';

type Row = Record<string, any>;
type Lookups = { companies: Row[]; carriers: Row[]; services: Row[] };

type FieldDef = {
  key: string; // nome do campo enviado para a API
  from: string; // coluna retornada pela API
  label: string;
  type?: 'text' | 'number' | 'select' | 'checkbox' | 'digits' | 'uf';
  required?: boolean;
  options?: [string, string][] | ((l: Lookups) => [string, string][]);
  hint?: string;
  maxLength?: number;
  full?: boolean;
  group?: 'logistics';
  defaultValue?: string;
};

type Column = { label: string; render: (row: Row, l: Lookups) => React.ReactNode; right?: boolean };

type Resource = { key: string; label: string; singular: string; fem?: boolean; fields: FieldDef[]; columns: Column[] };

const g = (r: Resource, masc: string, fem: string) => (r.fem ? fem : masc);

const place = (r: Row) => [r.city, r.state].filter(Boolean).join(' / ') || '-';
const active = (r: Row) => <StatusBadge status={r.is_active === false ? 'Inativo' : 'Ativo'} />;
const addressFields: FieldDef[] = [
  { key: 'postalCode', from: 'postal_code', label: 'CEP', type: 'digits', required: true, maxLength: 9 },
  { key: 'city', from: 'city', label: 'Cidade', required: true },
  { key: 'state', from: 'state', label: 'UF', type: 'uf', required: true, maxLength: 2 },
  { key: 'addressLine', from: 'address_line', label: 'Endereço', required: true, full: true }
];

const RESOURCES: Resource[] = [
  {
    key: 'carriers', label: 'Transportadoras', singular: 'transportadora', fem: true,
    fields: [
      { key: 'name', from: 'name', label: 'Nome', required: true },
      { key: 'cnpj', from: 'cnpj', label: 'CNPJ', type: 'digits', maxLength: 18, hint: 'Usado para vincular os CT-es emitidos por ela' },
      { key: 'externalName', from: 'external_name', label: 'Nome nas tabelas/marketplaces', hint: 'Como a transportadora aparece nas planilhas de frete' },
      { key: 'priority', from: 'priority', label: 'Prioridade', type: 'number', hint: 'Menor número = preferida em caso de empate' },
      { key: 'isActive', from: 'is_active', label: 'Ativa', type: 'checkbox' }
    ],
    columns: [
      { label: 'Nome', render: (r) => r.name },
      { label: 'CNPJ', render: (r) => (r.cnpj ? formatDocument(r.cnpj) : '-') },
      { label: 'Nome nas tabelas', render: (r) => r.external_name || '-' },
      { label: 'Prioridade', render: (r) => r.priority, right: true },
      { label: 'Situação', render: active }
    ]
  },
  {
    key: 'carrier-mappings', label: 'De-para de transportadoras', singular: 'de-para',
    fields: [
      { key: 'sourceName', from: 'source_name', label: 'Nome recebido do canal', required: true, full: true, hint: 'Exatamente como vem no pedido do marketplace/ERP (ex.: RODONAVES TRANSPS E ENCOMENDAS LTDA, Mercado Envios)' },
      { key: 'sourceService', from: 'source_service', label: 'Serviço recebido', hint: 'Opcional — para diferenciar serviços da mesma transportadora' },
      { key: 'channel', from: 'channel', label: 'Canal', type: 'select', options: CHANNEL_OPTIONS.map((c) => [c.value, c.label] as [string, string]), hint: 'Em branco = todos os canais' },
      { key: 'carrierId', from: 'carrier_id', label: 'Transportadora no TMS', type: 'select', options: (l) => l.carriers.map((c) => [c.id, c.name]) },
      { key: 'carrierServiceId', from: 'carrier_service_id', label: 'Serviço no TMS', type: 'select', options: (l) => l.services.map((sv) => [sv.id, `${l.carriers.find((c) => c.id === sv.carrier_id)?.name || ''} · ${sv.name}`]) },
      { key: 'ignoreIntegration', from: 'ignore_integration', label: 'Ignorar integração (frete feito pelo canal: Mercado Envios, Fulfillment...)', type: 'checkbox', defaultValue: 'false', full: true },
      { key: 'ignoreCost', from: 'ignore_cost', label: 'Não considerar o custo na auditoria de frete', type: 'checkbox', defaultValue: 'false', full: true }
    ],
    columns: [
      { label: 'Nome recebido', render: (r) => <>{r.source_name}{r.source_service ? <span className="sub">{r.source_service}</span> : null}</> },
      { label: 'Canal', render: (r) => (r.channel ? channelLabel(r.channel) : 'Todos') },
      { label: 'Transportadora no TMS', render: (r) => (r.ignore_integration ? <StatusBadge status="Ignorado" /> : <>{r.carrier_name || '-'}{r.carrier_service_name ? <span className="sub">{r.carrier_service_name}</span> : null}</>) },
      { label: 'Custo na auditoria', render: (r) => (r.ignore_cost || r.ignore_integration ? 'Não considera' : 'Considera') }
    ]
  },
  {
    key: 'carrier-services', label: 'Serviços de transportadora', singular: 'serviço',
    fields: [
      { key: 'carrierId', from: 'carrier_id', label: 'Transportadora', type: 'select', required: true, options: (l) => l.carriers.map((c) => [c.id, c.name]) },
      { key: 'name', from: 'name', label: 'Nome do serviço', required: true, hint: 'Ex.: Expresso, Econômico' },
      { key: 'slaDays', from: 'sla_days', label: 'Prazo padrão (dias)', type: 'number' },
      { key: 'isActive', from: 'is_active', label: 'Ativo', type: 'checkbox' }
    ],
    columns: [
      { label: 'Serviço', render: (r) => r.name },
      { label: 'Transportadora', render: (r, l) => l.carriers.find((c) => c.id === r.carrier_id)?.name || '-' },
      { label: 'Prazo padrão', render: (r) => (r.sla_days != null ? `${r.sla_days} dia(s)` : '-'), right: true },
      { label: 'Situação', render: active }
    ]
  },
  {
    key: 'companies', label: 'Empresas', singular: 'empresa', fem: true,
    fields: [
      { key: 'cnpj', from: 'cnpj', label: 'CNPJ', type: 'digits', required: true, maxLength: 18 },
      { key: 'tradeName', from: 'trade_name', label: 'Nome fantasia', required: true },
      { key: 'legalName', from: 'legal_name', label: 'Razão social', required: true },
      ...addressFields
    ],
    columns: [
      { label: 'Nome fantasia', render: (r) => r.trade_name },
      { label: 'Razão social', render: (r) => r.legal_name },
      { label: 'CNPJ', render: (r) => formatDocument(r.cnpj) },
      { label: 'Cidade / UF', render: place }
    ]
  },
  {
    key: 'distribution-centers', label: 'Centros de distribuição', singular: 'centro de distribuição',
    fields: [
      { key: 'companyId', from: 'company_id', label: 'Empresa', type: 'select', required: true, options: (l) => l.companies.map((c) => [c.id, c.trade_name]) },
      { key: 'name', from: 'name', label: 'Nome', required: true },
      { key: 'isActive', from: 'is_active', label: 'Ativo', type: 'checkbox' },
      ...addressFields
    ],
    columns: [
      { label: 'Nome', render: (r) => r.name },
      { label: 'Empresa', render: (r, l) => l.companies.find((c) => c.id === r.company_id)?.trade_name || '-' },
      { label: 'CEP', render: (r) => formatCep(r.postal_code) },
      { label: 'Cidade / UF', render: place },
      { label: 'Situação', render: active }
    ]
  },
  {
    key: 'products', label: 'Produtos', singular: 'produto',
    fields: [
      { key: 'companyId', from: 'company_id', label: 'Empresa', type: 'select', options: (l) => l.companies.map((c) => [c.id, c.trade_name]), hint: 'O mesmo SKU pode existir em empresas diferentes' },
      { key: 'skuInternal', from: 'sku_internal', label: 'SKU interno', required: true },
      { key: 'skuExternal', from: 'sku_external', label: 'SKU no marketplace' },
      { key: 'name', from: 'name', label: 'Nome', required: true },
      { key: 'category', from: 'category', label: 'Categoria' },
      // Peso e medidas em qualquer unidade: a API converte para kg/cm usados nas tabelas de frete.
      { key: 'weight', from: 'weight_kg', label: 'Peso', type: 'number', group: 'logistics' },
      { key: 'weightUnit', from: '__weight_unit', label: 'Unidade do peso', type: 'select', group: 'logistics', defaultValue: 'kg', options: [['g', 'gramas (g)'], ['kg', 'quilos (kg)'], ['t', 'toneladas (t)'], ['lb', 'libras (lb)'], ['oz', 'onças (oz)']] },
      { key: 'length', from: 'length_cm', label: 'Comprimento', type: 'number', group: 'logistics' },
      { key: 'width', from: 'width_cm', label: 'Largura', type: 'number', group: 'logistics' },
      { key: 'height', from: 'height_cm', label: 'Altura', type: 'number', group: 'logistics' },
      { key: 'dimensionUnit', from: '__dimension_unit', label: 'Unidade das medidas', type: 'select', group: 'logistics', defaultValue: 'cm', options: [['mm', 'milímetros (mm)'], ['cm', 'centímetros (cm)'], ['m', 'metros (m)'], ['pol', 'polegadas (pol)']] }
    ],
    columns: [
      { label: 'SKU', render: (r) => r.sku_internal },
      { label: 'Empresa', render: (r) => r.company_name || '-' },
      { label: 'Nome', render: (r) => r.name },
      { label: 'Categoria', render: (r) => r.category || '-' },
      { label: 'Peso', render: (r) => (r.weight_kg != null ? `${formatNumber(r.weight_kg)} kg` : '-'), right: true },
      { label: 'Medidas (C × L × A)', render: (r) => (r.missing_logistics ? <StatusBadge status="Pendente" /> : `${formatNumber(r.length_cm)} × ${formatNumber(r.width_cm)} × ${formatNumber(r.height_cm)} cm`) }
    ]
  },
  {
    key: 'recipients', label: 'Destinatários', singular: 'destinatário',
    fields: [
      { key: 'document', from: 'document', label: 'CPF/CNPJ', type: 'digits', required: true, maxLength: 18 },
      { key: 'legalName', from: 'legal_name', label: 'Nome / razão social', required: true },
      { key: 'type', from: 'type', label: 'Tipo', type: 'select', required: true, options: [['PF', 'Pessoa física'], ['PJ', 'Pessoa jurídica']] },
      ...addressFields
    ],
    columns: [
      { label: 'Nome', render: (r) => r.legal_name },
      { label: 'CPF/CNPJ', render: (r) => formatDocument(r.document) },
      { label: 'Tipo', render: (r) => (r.type === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física') },
      { label: 'Cidade / UF', render: place }
    ]
  }
];

export function CrudPanel() {
  // Permite abrir direto uma aba e um cadastro pré-preenchido (ex.: "Criar de-para" a partir de uma pendência).
  const params = useSearchParams();
  const initialTab = RESOURCES.some((r) => r.key === params.get('tab')) ? String(params.get('tab')) : RESOURCES[0].key;
  const [resourceKey, setResourceKey] = useState(initialTab);
  const [editing, setEditing] = useState<Row | null>(() => (params.get('novo') ? { source_name: params.get('novo'), channel: params.get('canal') || null } : null));
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const resource = RESOURCES.find((r) => r.key === resourceKey)!;
  const list = useApi(() => api(`/${resource.key}`), [resource.key]);
  const companies = useApi(() => api('/companies'), []);
  const carriers = useApi(() => api('/carriers'), []);
  const services = useApi(() => api('/carrier-services'), []);
  const lookups: Lookups = { companies: (companies.data as any)?.items || [], carriers: (carriers.data as any)?.items || [], services: (services.data as any)?.items || [] };

  const rows: Row[] = useMemo(() => {
    const items: Row[] = (list.data as any)?.items || [];
    const term = search.trim().toLowerCase();
    return term ? items.filter((r) => Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(term))) : items;
  }, [list.data, search]);

  function refreshAll() {
    list.reload();
    if (resource.key === 'companies') companies.reload();
    if (resource.key === 'carriers') carriers.reload();
  }

  async function remove(row: Row) {
    const name = row.name || row.trade_name || row.legal_name || row.sku_internal;
    if (!window.confirm(`Excluir ${resource.singular} "${name}"?`)) return;
    setFeedback(null);
    try {
      await api(`/${resource.key}/${row.id}`, { method: 'DELETE' });
      setFeedback({ ok: true, text: `${capitalize(resource.singular)} "${name}" ${g(resource, 'excluído', 'excluída')}.` });
      refreshAll();
    } catch (e: any) {
      setFeedback({ ok: false, text: `Não foi possível excluir: ${e.message}` });
    }
  }

  return (
    <div className="grid">
      <PageHeader title="Cadastros" subtitle="Transportadoras, empresas, produtos e destinatários" actions={<button className="btn primary" onClick={() => setEditing({})}><Icon name="plus" />{g(resource, 'Novo', 'Nova')} {resource.singular}</button>} />

      <div className="tabs" role="tablist">
        {RESOURCES.map((r) => (
          <button key={r.key} role="tab" aria-selected={r.key === resourceKey} className={`tab ${r.key === resourceKey ? 'active' : ''}`} onClick={() => { setResourceKey(r.key); setSearch(''); setFeedback(null); }}>
            {r.label}
          </button>
        ))}
      </div>

      {feedback ? <div className={`notice ${feedback.ok ? 'ok' : 'err'}`}>{feedback.text}</div> : null}

      {resource.key === 'products' ? <ProductImport onImported={list.reload} /> : null}

      <Panel title={resource.label} subtitle={list.loading ? undefined : `${rows.length} registro(s)`} right={<button className="btn sm" onClick={list.reload}><Icon name="refresh" />Atualizar</button>}>
        <div className="filter-row">
          <input className="input grow" type="search" placeholder={`Buscar em ${resource.label.toLowerCase()}...`} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {list.loading ? <LoadingState /> : list.error ? <ErrorState text={list.error} /> : rows.length === 0 ? <EmptyState text={search ? 'Nenhum registro encontrado.' : `${g(resource, 'Nenhum', 'Nenhuma')} ${resource.singular} ${g(resource, 'cadastrado', 'cadastrada')}.`} /> : (
          <div className="table-wrap">
            <table className="stack">
              <thead><tr>{resource.columns.map((c) => <th key={c.label} className={c.right ? 'text-right' : ''}>{c.label}</th>)}<th></th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {resource.columns.map((c, i) => <td key={c.label} data-label={c.label} className={i === 0 ? 'cell-title' : c.right ? 'text-right' : ''}>{c.render(row, lookups)}</td>)}
                    <td data-label="">
                      <div className="row-actions">
                        <button className="btn ghost sm" title="Editar" aria-label="Editar" onClick={() => setEditing(row)}><Icon name="edit" /></button>
                        <button className="btn ghost sm" title="Excluir" aria-label="Excluir" style={{ color: 'var(--red)' }} onClick={() => remove(row)}><Icon name="trash" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {editing ? (
        <RecordModal
          resource={resource}
          row={editing}
          lookups={lookups}
          onClose={() => setEditing(null)}
          onSaved={(text) => { setEditing(null); setFeedback({ ok: true, text }); refreshAll(); }}
        />
      ) : null}
    </div>
  );
}

function RecordModal({ resource, row, lookups, onClose, onSaved }: { resource: Resource; row: Row; lookups: Lookups; onClose: () => void; onSaved: (text: string) => void }) {
  const isNew = !row.id;
  const reprocessMsg = (saved: any) => (saved?.reprocessed ? ` ${saved.reprocessed} pedido(s) pendente(s) reprocessado(s).` : '');
  const [form, setForm] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    for (const f of resource.fields) {
      const v = row[f.from];
      initial[f.key] = f.type === 'checkbox' ? (v === undefined || v === null ? f.defaultValue !== 'false' : v !== false) : v == null ? f.defaultValue ?? '' : String(v);
    }
    return initial;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const mainFields = resource.fields.filter((f) => !f.group);
  const logisticsFields = resource.fields.filter((f) => f.group === 'logistics');

  function toValue(f: FieldDef) {
    const v = form[f.key];
    if (f.type === 'checkbox') return Boolean(v);
    if (f.type === 'number') return v === '' ? undefined : Number(String(v).replace(',', '.'));
    if (f.type === 'digits') return String(v).replace(/\D/g, '');
    if (f.type === 'uf') return String(v).trim().toUpperCase();
    return String(v).trim();
  }

  async function save() {
    const missing = resource.fields.find((f) => f.required && !String(form[f.key] ?? '').trim());
    if (missing) return setError(`Preencha o campo "${missing.label}".`);
    const logistics = Object.fromEntries(logisticsFields.map((f) => [f.key, toValue(f)]));
    const measureFields = logisticsFields.filter((f) => f.type === 'number');
    const hasLogistics = measureFields.some((f) => String(form[f.key] ?? '').trim());
    if (hasLogistics && measureFields.some((f) => !String(form[f.key] ?? '').trim())) return setError('Informe peso e as três medidas do produto (ou deixe todos em branco).');

    const body: Record<string, any> = {};
    for (const f of mainFields) {
      const v = toValue(f);
      if (v !== undefined && !(isNew && v === '')) body[f.key] = v;
    }

    setBusy(true);
    setError('');
    try {
      const saved = isNew
        ? await api(`/${resource.key}`, { method: 'POST', body: JSON.stringify(body) })
        : await api(`/${resource.key}/${row.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      if (hasLogistics) {
        await api('/product-logistics', { method: 'POST', body: JSON.stringify({ productId: saved.id || row.id, ...logistics }) });
      }
      onSaved(saved?.reused ? `Já existia ${g(resource, 'um', 'uma')} ${resource.singular} com esses dados — o cadastro existente foi mantido.` : `${capitalize(resource.singular)} ${g(resource, 'salvo', 'salva')} com sucesso.${reprocessMsg(saved)}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function renderField(f: FieldDef) {
    const opts = typeof f.options === 'function' ? f.options(lookups) : f.options || [];
    if (f.type === 'checkbox') {
      return (
        <label key={f.key} className={`check ${f.full ? 'full' : ''}`} style={{ alignSelf: 'end' }}>
          <input type="checkbox" checked={Boolean(form[f.key])} onChange={(e) => set(f.key, e.target.checked)} />
          {f.label}
        </label>
      );
    }
    return (
      <Field key={f.key} label={f.label} required={f.required} hint={f.hint} className={f.full ? 'full' : ''}>
        {f.type === 'select' ? (
          <select className="select" value={form[f.key]} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">Selecione...</option>
            {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ) : (
          <input
            className="input"
            inputMode={f.type === 'number' ? 'decimal' : f.type === 'digits' ? 'numeric' : undefined}
            maxLength={f.maxLength}
            value={form[f.key]}
            onChange={(e) => set(f.key, f.type === 'uf' ? e.target.value.toUpperCase() : e.target.value)}
          />
        )}
      </Field>
    );
  }

  return (
    <Modal title={`${isNew ? g(resource, 'Novo', 'Nova') : 'Editar'} ${resource.singular}`} onClose={onClose}>
      <div className="form-grid">
        {mainFields.map(renderField)}
        {logisticsFields.length ? <div className="form-section">Dados logísticos (usados no cálculo do frete)</div> : null}
        {logisticsFields.map(renderField)}
      </div>
      {error ? <div className="notice err">{error}</div> : null}
      <div className="form-actions">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Salvando...' : 'Salvar'}</button>
      </div>
    </Modal>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
