'use client';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MOCK_SHIPPING_RULES } from './mock';
import type { ShippingRule } from './types';

const ACTION_OPTIONS = [
  'Frete grátis', 'Desconto percentual', 'Desconto fixo', 'Adicional percentual', 'Adicional fixo',
  'Bloquear transportadora', 'Bloquear serviço', 'Priorizar transportadora', 'Adicionar prazo',
  'Aplicar mínimo', 'Aplicar máximo', 'Ajustar margem operacional'
];

export function ShippingRulesPage() {
  const [rules, setRules] = useState<ShippingRule[]>(MOCK_SHIPPING_RULES);
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => rules.filter((r) => {
    if (status !== 'all' && String(r.active) !== status) return false;
    if (type !== 'all' && !r.actionType.toLowerCase().includes(type)) return false;
    return true;
  }), [rules, status, type]);

  return (
    <div className="grid">
      <PageHeader title="Regras de Frete" subtitle="Configure descontos, adicionais e condições especiais" actions={<button className="btn primary" onClick={() => setOpen(true)}>+ Nova Regra</button>} />

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
                  <td><div className="row-actions"><button className="btn ghost">✎</button><button className="btn ghost">⧉</button><button className="btn danger">🗑</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {open ? <RuleModal onClose={() => setOpen(false)} onSave={(payload) => {
        setRules((prev) => [{ ...payload, id: String(Date.now()), updatedAt: new Date().toLocaleString() }, ...prev]);
        setOpen(false);
      }} /> : null}
    </div>
  );
}

function RuleModal({ onClose, onSave }: { onClose: () => void; onSave: (rule: ShippingRule) => void }) {
  const [form, setForm] = useState<ShippingRule>({
    id: '',
    name: '',
    description: '',
    priority: 10,
    active: true,
    validFrom: '',
    validTo: '',
    channel: '',
    carrier: '',
    service: '',
    region: '',
    actionType: ACTION_OPTIONS[0],
    value: '',
    updatedAt: '',
    conditions: {}
  });

  const set = (k: keyof ShippingRule, v: any) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="panel-head"><h3>Nova Regra de Frete</h3><button className="btn ghost" onClick={onClose}>Fechar</button></div>
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
              <input className="input" placeholder="Transportadora" value={form.carrier} onChange={(e) => set('carrier', e.target.value)} />
              <input className="input" placeholder="Serviço" value={form.service} onChange={(e) => set('service', e.target.value)} />
              <input className="input" placeholder="Faixa CEP" onChange={(e) => set('conditions', { ...form.conditions, cepRange: e.target.value })} />
              <input className="input" placeholder="Cidade" onChange={(e) => set('conditions', { ...form.conditions, city: e.target.value })} />
              <input className="input" placeholder="UF" onChange={(e) => set('conditions', { ...form.conditions, state: e.target.value })} />
              <input className="input" placeholder="SKU" onChange={(e) => set('conditions', { ...form.conditions, sku: e.target.value })} />
              <input className="input" placeholder="Categoria" onChange={(e) => set('conditions', { ...form.conditions, category: e.target.value })} />
              <input className="input" placeholder="Faixa de peso" onChange={(e) => set('conditions', { ...form.conditions, weightRange: e.target.value })} />
              <input className="input" placeholder="Faixa de cubagem" onChange={(e) => set('conditions', { ...form.conditions, cubageRange: e.target.value })} />
              <input className="input" placeholder="Faixa valor pedido" onChange={(e) => set('conditions', { ...form.conditions, orderValueRange: e.target.value })} />
              <select className="select" onChange={(e) => set('conditions', { ...form.conditions, customerType: e.target.value })}><option>PF/PJ</option><option>PF</option><option>PJ</option></select>
            </div>
          </Panel>

          <Panel title="Ação da regra">
            <div className="form-grid">
              <select className="select" value={form.actionType} onChange={(e) => set('actionType', e.target.value)}>{ACTION_OPTIONS.map((a) => <option key={a}>{a}</option>)}</select>
              <input className="input" placeholder="Valor (%, R$, dias...)" value={form.value} onChange={(e) => set('value', e.target.value)} />
            </div>
          </Panel>

          <div className="filter-row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>Cancelar</button>
            <button className="btn primary" onClick={() => onSave(form)}>Salvar Regra</button>
          </div>
        </div>
      </div>
    </div>
  );
}
