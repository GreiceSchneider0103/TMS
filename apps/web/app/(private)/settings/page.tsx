import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';

export default function SettingsPage() {
  return (
    <div className="grid">
      <PageHeader title="Configurações" subtitle="Gerencie as configurações do sistema" />

      <Panel title="Integração Tiny ERP" subtitle="Configuração de conexão com ERP" right={<StatusBadge status="Conectado" />}>
        <div className="grid">
          <label>
            <small style={{ color: '#9fb0d8' }}>Token de acesso</small>
            <input className="input" value="••••••••••••••••••••••••••" readOnly />
          </label>
          <label>
            <small style={{ color: '#9fb0d8' }}>URL do webhook</small>
            <input className="input" value="https://tms.exemplo.com/webhook/tiny" readOnly />
          </label>
          <div className="filter-row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn">Sincronizar Agora</button>
          </div>
        </div>
      </Panel>

      <Panel title="API Keys" subtitle="Chaves de acesso para integrações externas">
        <div className="grid">
          <div className="panel" style={{ borderRadius: 10 }}><div className="panel-body" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="mono">tms_prod_•••••••••••</span><div className="row-actions"><StatusBadge status="Ativa" /><button className="btn danger">Revogar</button></div></div></div>
          <div className="panel" style={{ borderRadius: 10 }}><div className="panel-body" style={{ display: 'flex', justifyContent: 'space-between' }}><span className="mono">tms_dev_••••••••••••</span><div className="row-actions"><StatusBadge status="Ativa" /><button className="btn danger">Revogar</button></div></div></div>
          <button className="btn">Gerar Nova API Key</button>
        </div>
      </Panel>
    </div>
  );
}
