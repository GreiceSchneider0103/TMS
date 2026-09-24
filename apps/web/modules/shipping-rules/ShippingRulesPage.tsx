'use client';
import { useMemo, useState } from 'react';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { channelLabel } from '@/services/format';
import { ACTION_OPTIONS, apiRuleToRule, ruleToApiPayload } from './types';
import type { ShippingRule } from './types';

const EMPTY_RULE: ShippingRule = {
  id: '', name: '', description: '', priority: 10, active: true, validFrom: '', validTo: '', channel: '', carrier: '', service: '', region: '', actionType: ACTION_OPTIONS[0], value: '', updatedAt: '', conditions: {}
};

const CARRIER_ACTIONS = ['Bloquear transportadora', 'Priorizar transportadora'];
const VALUE_HINT: Record<string, string> = {
  'Desconto percentual': 'Percentual (ex.: 10 para 10%)',
  'Adicional percentual': 'Percentual (ex.: 5 para 5%)',
  'Desconto fixo': 'Valor em R$',
  'Adicional fixo': 'Valor em R$',
  'Adicionar prazo': 'Dias a somar ao prazo',
  'Aplicar mínimo': 'Valor mínimo do frete em R$',
  'Aplicar máximo': 'Valor máximo do frete em R$'
};

function formatActionValue(rule: ShippingRule, carrierName: (id: string) => string) {
  if (!rule.value) return '-';
  if (CARRIER_ACTIONS.includes(rule.actionType)) return carrierName(rule.value);
  if (rule.actionType.includes('percentual')) return `${rule.value}%`;
  if (rule.actionType === 'Adicionar prazo') return `+${rule.value} dia(s)`;
  return `R$ ${rule.value}`;
}

export function ShippingRulesPage() {
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [modalRule, setModalRule] = useState<ShippingRule | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const { data, loading, error, reload } = useApi(() => api('/shipping-rules'), []);
  const carriers = useApi(() => api('/carriers'), []);
  const carrierItems: any[] = (carriers.data as any)?.items || [];
  const carrierName = (id: string) => carrierItems.find((c) => c.id === id)?.name || 'Transportadora removida';

  const rules: ShippingRule[] = useMemo(() => ((data as any)?.items || []).map(apiRuleToRule), [data]);

  const filtered = useMemo(() => rules.filter((r) => {
    if (status !== 'all' && String(r.active) !== status) return false;
    if (type !== 'all' && !r.actionType.toLowerCase().includes(type)) return false;
    return true;
  }), [rules, status, type]);

  async function save(rule: ShippingRule) {
    setBusy(true);
    try {
      const payload = ruleToApiPayload(rule);
      if (rule.id) {
        await api(`/shipping-rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/shipping-rules', { method: 'POST', body: JSON.stringify(payload) });
      }
      setModalRule(null);
      setFeedback({ ok: true, text: `Regra "${rule.name}" salva.` });
      reload();
    } catch (e: any) {
      setFeedback({ ok: false, text: `Não foi possível salvar a regra: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function remove(rule: ShippingRule) {
    if (!confirm(`Excluir a regra "${rule.name}"?`)) return;
    setBusy(true);
    try {
      await api(`/shipping-rules/${rule.id}`, { method: 'DELETE' });
      setFeedback({ ok: true, text: `Regra "${rule.name}" excluída.` });
      reload();
    } catch (e: any) {
      setFeedback({ ok: false, text: `Não foi possível excluir a regra: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid">
      <PageHeader title="Regras de frete" subtitle="Descontos, adicionais e condições especiais aplicados às cotações" actions={<button className="btn primary" onClick={() => setModalRule(EMPTY_RULE)}><Icon name="plus" />Nova regra</button>} />

      <div className="kpi-grid">
        <StatCard title="Total de regras" value={rules.length} />
        <StatCard title="Regras ativas" value={rules.filter((r) => r.active).length} tone="success" />
        <StatCard title="Descontos" value={rules.filter((r) => r.actionType.toLowerCase().includes('desconto') || r.actionType.toLowerCase().includes('frete grátis')).length} tone="info" />
        <StatCard title="Adicionais" value={rules.filter((r) => r.actionType.toLowerCase().includes('adicional')).length} tone="warning" />
      </div>

      {feedback && !modalRule ? <div className={`notice ${feedback.ok ? 'ok' : 'err'}`}>{feedback.text}</div> : null}

      <Panel title="Regras cadastradas">
        <div className="filter-row">
          <Field label="Tipo">
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">Todos</option>
              <option value="desconto">Desconto</option>
              <option value="adicional">Adicional</option>
              <option value="bloquear">Bloqueio</option>
            </select>
          </Field>
          <Field label="Situação">
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Todas</option>
              <option value="true">Ativas</option>
              <option value="false">Inativas</option>
            </select>
          </Field>
        </div>

        {loading ? <LoadingState text="Carregando regras..." /> : error ? <ErrorState text={error} /> : filtered.length === 0 ? <EmptyState text={rules.length ? 'Nenhuma regra para os filtros selecionados.' : 'Nenhuma regra cadastrada. Clique em “Nova regra” para criar a primeira.'} /> : (
          <div className="table-wrap">
            <table className="stack">
              <thead><tr><th>Prioridade</th><th>Nome</th><th>Canal</th><th>Região</th><th>Transportadora</th><th>Ação</th><th>Valor</th><th>Situação</th><th>Atualizada em</th><th></th></tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Prioridade">{r.priority}</td>
                    <td className="cell-title">{r.name}{r.description ? <span className="sub">{r.description}</span> : null}</td>
                    <td data-label="Canal">{r.channel ? channelLabel(r.channel) : 'Todos'}</td>
                    <td data-label="Região">{r.region || 'Todas'}</td>
                    <td data-label="Transportadora">{r.carrier ? carrierName(r.carrier) : 'Todas'}</td>
                    <td data-label="Ação">{r.actionType}</td>
                    <td data-label="Valor" className="nowrap">{formatActionValue(r, carrierName)}</td>
                    <td data-label="Situação"><StatusBadge status={r.active ? 'Ativa' : 'Inativa'} /></td>
                    <td data-label="Atualizada em" className="nowrap">{r.updatedAt || '-'}</td>
                    <td data-label="">
                      <div className="row-actions">
                        <button className="btn ghost sm" title="Editar" aria-label="Editar" disabled={busy} onClick={() => setModalRule(r)}><Icon name="edit" /></button>
                        <button className="btn ghost sm" title="Duplicar" aria-label="Duplicar" disabled={busy} onClick={() => setModalRule({ ...r, id: '', name: `${r.name} (cópia)` })}><Icon name="copy" /></button>
                        <button className="btn ghost sm" title="Excluir" aria-label="Excluir" disabled={busy} style={{ color: 'var(--red)' }} onClick={() => remove(r)}><Icon name="trash" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {modalRule ? <RuleModal rule={modalRule} carriers={carrierItems} busy={busy} error={feedback && !feedback.ok ? feedback.text : ''} onClose={() => { setModalRule(null); setFeedback(null); }} onSave={save} /> : null}
    </div>
  );
}

function RuleModal({ rule, carriers, busy, error, onClose, onSave }: { rule: ShippingRule; carriers: any[]; busy: boolean; error: string; onClose: () => void; onSave: (rule: ShippingRule) => void }) {
  const [form, setForm] = useState<ShippingRule>(rule);
  const set = (k: keyof ShippingRule, v: any) => setForm((p) => ({ ...p, [k]: v }));
  const setCond = (k: string, v: string) => setForm((p) => ({ ...p, conditions: { ...p.conditions, [k]: v } }));
  const c = form.conditions || {};
  const carrierAction = CARRIER_ACTIONS.includes(form.actionType);

  return (
    <Modal title={rule.id ? 'Editar regra de frete' : 'Nova regra de frete'} onClose={onClose}>
      <div className="form-grid">
        <div className="form-section">Informações gerais</div>
        <Field label="Nome" required className="span-2"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Prioridade" hint="Menor número = aplicada primeiro"><input className="input" type="number" min={0} value={form.priority} onChange={(e) => set('priority', Number(e.target.value))} /></Field>
        <Field label="Situação">
          <select className="select" value={String(form.active)} onChange={(e) => set('active', e.target.value === 'true')}><option value="true">Ativa</option><option value="false">Inativa</option></select>
        </Field>
        <Field label="Válida a partir de"><input className="input" type="date" value={form.validFrom} onChange={(e) => set('validFrom', e.target.value)} /></Field>
        <Field label="Válida até"><input className="input" type="date" value={form.validTo} onChange={(e) => set('validTo', e.target.value)} /></Field>
        <Field label="Descrição" className="full"><input className="input" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>

        <div className="form-section">Quando aplicar (deixe em branco para “qualquer”)</div>
        <Field label="Canal de venda">
          <select className="select" value={form.channel} onChange={(e) => set('channel', e.target.value)}>
            <option value="">Todos</option>
            <option value="shopee">Shopee</option>
            <option value="magalu">Magalu</option>
            <option value="tiny">Tiny ERP</option>
          </select>
        </Field>
        <Field label="Transportadora">
          <select className="select" value={form.carrier} onChange={(e) => set('carrier', e.target.value)}>
            <option value="">Todas</option>
            {carriers.map((cr) => <option key={cr.id} value={cr.id}>{cr.name}</option>)}
          </select>
        </Field>
        <Field label="Tipo de cliente">
          <select className="select" value={c.customerType || 'PF/PJ'} onChange={(e) => setCond('customerType', e.target.value)}>
            <option value="PF/PJ">Pessoa física e jurídica</option><option value="PF">Pessoa física</option><option value="PJ">Pessoa jurídica</option>
          </select>
        </Field>
        <Field label="Faixa de CEP" hint="Ex.: 01000000-05999999"><input className="input" value={c.cepRange || ''} onChange={(e) => setCond('cepRange', e.target.value)} /></Field>
        <Field label="Cidade"><input className="input" value={c.city || ''} onChange={(e) => setCond('city', e.target.value)} /></Field>
        <Field label="UF"><input className="input" maxLength={2} value={c.state || ''} onChange={(e) => setCond('state', e.target.value.toUpperCase())} /></Field>
        <Field label="SKU"><input className="input" value={c.sku || ''} onChange={(e) => setCond('sku', e.target.value)} /></Field>
        <Field label="Categoria"><input className="input" value={c.category || ''} onChange={(e) => setCond('category', e.target.value)} /></Field>
        <Field label="Faixa de peso (kg)" hint="Ex.: 0-10"><input className="input" value={c.weightRange || ''} onChange={(e) => setCond('weightRange', e.target.value)} /></Field>
        <Field label="Faixa de valor do pedido (R$)" hint="Ex.: 0-500"><input className="input" value={c.orderValueRange || ''} onChange={(e) => setCond('orderValueRange', e.target.value)} /></Field>

        <div className="form-section">O que fazer</div>
        <Field label="Ação" required>
          <select className="select" value={form.actionType} onChange={(e) => setForm((p) => ({ ...p, actionType: e.target.value, value: '' }))}>{ACTION_OPTIONS.map((a) => <option key={a}>{a}</option>)}</select>
        </Field>
        {form.actionType === 'Frete grátis' ? null : carrierAction ? (
          <Field label="Transportadora da ação" required>
            <select className="select" value={form.value} onChange={(e) => set('value', e.target.value)}>
              <option value="">Escolha...</option>
              {carriers.map((cr) => <option key={cr.id} value={cr.id}>{cr.name}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Valor" required hint={VALUE_HINT[form.actionType]}>
            <input className="input" inputMode="decimal" value={form.value} onChange={(e) => set('value', e.target.value.replace(',', '.'))} />
          </Field>
        )}
      </div>

      {error ? <div className="notice err">{error}</div> : null}
      <div className="form-actions">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" disabled={busy || !form.name.trim()} onClick={() => onSave(form)}>{busy ? 'Salvando...' : 'Salvar regra'}</button>
      </div>
    </Modal>
  );
}
