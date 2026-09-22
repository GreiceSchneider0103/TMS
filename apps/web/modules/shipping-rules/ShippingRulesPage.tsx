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
import { ACTION_OPTIONS, apiRuleToRule, ruleToApiPayload } from './types';
import type { ShippingRule } from './types';

const EMPTY_RULE: ShippingRule = {
  id: '', name: '', description: '', priority: 10, active: true, validFrom: '', validTo: '', channel: '', carrier: '', service: '', region: '', actionType: ACTION_OPTIONS[0], value: '', updatedAt: '', conditions: {}
};

export function ShippingRulesPage() {
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [modalRule, setModalRule] = useState<ShippingRule | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const { data, loading, error } = useApi(() => api('/shipping-rules'), [nonce]);

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
      setNonce((v) => v + 1);
    } catch (e: any) {
      alert(`Falha ao salvar regra: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(rule: ShippingRule) {
    if (!confirm(`Excluir a regra "${rule.name}"?`)) return;
    setBusy(true);
    try {
      await api(`/shipping-rules/${rule.id}`, { method: 'DELETE' });
      setNonce((v) => v + 1);
    } catch (e: any) {
      alert(`Falha ao excluir regra: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid">
      <PageHeader title="Regras de Frete" subtitle="Configure descontos, adicionais e condições especiais" actions={<button className="btn primary" onClick={() => setModalRule(EMPTY_RULE)}>+ Nova Regra</button>} />

      <div className="kpi-grid">
        <StatCard title="Total de Regras" value={rules.length} />
        <StatCard title="Regras Ativas" value={rules.filter((r) => r.active).length} tone="success" />
        <StatCard title="Descontos" value={rules.filter((r) => r.actionType.toLowerCase().includes('desconto') || r.actionType.toLowerCase().includes('frete grátis')).length} tone="info" />
        <StatCard title="Adicionais" value={rules.filter((r) => r.actionType.toLowerCase().includes('adicional')).length} tone="warning" />
      </div>

      <Panel title="Regras Cadastradas">
        <div className="filter-row">
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">Todos os tipos</option>
            <option value="desconto">Desconto</option>
            <option value="adicional">Adicional</option>
            <option value="bloquear">Bloqueio</option>
          </select>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todos os status</option>
            <option value="true">Ativa</option>
            <option value="false">Inativa</option>
          </select>
        </div>

        {loading ? <LoadingState text="Carregando regras..." /> : error ? <ErrorState text={error} /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Prioridade</th><th>Nome</th><th>Canal</th><th>Região</th><th>Transportadora</th><th>Tipo de Ação</th><th>Valor</th><th>Status</th><th>Última atualização</th><th>Ações</th></tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>{r.priority}</td>
                    <td>{r.name}</td>
                    <td>{r.channel || '-'}</td>
                    <td>{r.region || '-'}</td>
                    <td>{r.carrier || '-'}</td>
                    <td>{r.actionType}</td>
                    <td>{r.value || '-'}</td>
                    <td><StatusBadge status={r.active ? 'Ativa' : 'Inativa'} /></td>
                    <td>{r.updatedAt}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn ghost" disabled={busy} onClick={() => setModalRule(r)}>✎</button>
                        <button className="btn ghost" disabled={busy} onClick={() => setModalRule({ ...r, id: '', name: `${r.name} (cópia)` })}>⧉</button>
                        <button className="btn danger" disabled={busy} onClick={() => remove(r)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {modalRule ? <RuleModal rule={modalRule} busy={busy} onClose={() => setModalRule(null)} onSave={save} /> : null}
    </div>
  );
}

function RuleModal({ rule, busy, onClose, onSave }: { rule: ShippingRule; busy: boolean; onClose: () => void; onSave: (rule: ShippingRule) => void }) {
  const [form, setForm] = useState<ShippingRule>(rule);
  const set = (k: keyof ShippingRule, v: any) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="panel-head"><h3>{rule.id ? 'Editar Regra de Frete' : 'Nova Regra de Frete'}</h3><button className="btn ghost" onClick={onClose}>Fechar</button></div>
        <div className="panel-body grid">
          <Panel title="Informações gerais">
            <div className="form-grid">
              <input className="input" placeholder="Nome" value={form.name} onChange={(e) => set('name', e.target.value)} />
              <input className="input" type="number" placeholder="Prioridade" value={form.priority} onChange={(e) => set('priority', Number(e.target.value))} />
              <select className="select" value={String(form.active)} onChange={(e) => set('active', e.target.value === 'true')}><option value="true">Ativa</option><option value="false">Inativa</option></select>
              <input className="input" type="date" value={form.validFrom} onChange={(e) => set('validFrom', e.target.value)} />
              <input className="input" type="date" value={form.validTo} onChange={(e) => set('validTo', e.target.value)} />
              <input className="input full" placeholder="Descrição" value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
          </Panel>

          <Panel title="Condições">
            <div className="form-grid">
              <input className="input" placeholder="Canal" value={form.channel} onChange={(e) => set('channel', e.target.value)} />
              <input className="input" placeholder="ID da transportadora" value={form.carrier} onChange={(e) => set('carrier', e.target.value)} />
              <input className="input" placeholder="Faixa CEP (ex: 01000000-05999999)" value={form.conditions?.cepRange || ''} onChange={(e) => set('conditions', { ...form.conditions, cepRange: e.target.value })} />
              <input className="input" placeholder="Cidade" value={form.conditions?.city || ''} onChange={(e) => set('conditions', { ...form.conditions, city: e.target.value })} />
              <input className="input" placeholder="UF" value={form.conditions?.state || ''} onChange={(e) => set('conditions', { ...form.conditions, state: e.target.value })} />
              <input className="input" placeholder="SKU" value={form.conditions?.sku || ''} onChange={(e) => set('conditions', { ...form.conditions, sku: e.target.value })} />
              <input className="input" placeholder="Categoria" value={form.conditions?.category || ''} onChange={(e) => set('conditions', { ...form.conditions, category: e.target.value })} />
              <input className="input" placeholder="Faixa de peso (kg, ex: 0-10)" value={form.conditions?.weightRange || ''} onChange={(e) => set('conditions', { ...form.conditions, weightRange: e.target.value })} />
              <input className="input" placeholder="Faixa valor pedido (ex: 0-500)" value={form.conditions?.orderValueRange || ''} onChange={(e) => set('conditions', { ...form.conditions, orderValueRange: e.target.value })} />
              <select className="select" value={form.conditions?.customerType || 'PF/PJ'} onChange={(e) => set('conditions', { ...form.conditions, customerType: e.target.value })}><option>PF/PJ</option><option>PF</option><option>PJ</option></select>
            </div>
          </Panel>

          <Panel title="Ação da regra">
            <div className="form-grid">
              <select className="select" value={form.actionType} onChange={(e) => set('actionType', e.target.value)}>{ACTION_OPTIONS.map((a) => <option key={a}>{a}</option>)}</select>
              <input className="input" placeholder="Valor (%, R$, dias, ou ID da transportadora)" value={form.value} onChange={(e) => set('value', e.target.value)} />
            </div>
          </Panel>

          <div className="filter-row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>Cancelar</button>
            <button className="btn primary" disabled={busy || !form.name.trim()} onClick={() => onSave(form)}>Salvar Regra</button>
          </div>
        </div>
      </div>
    </div>
  );
}
