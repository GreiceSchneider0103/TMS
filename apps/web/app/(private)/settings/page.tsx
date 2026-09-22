'use client';
import { useState } from 'react';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';

export default function SettingsPage() {
  const [nonce, setNonce] = useState(0);
  const [label, setLabel] = useState('');
  const [role, setRole] = useState('integracao');
  const [newToken, setNewToken] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, loading, error } = useApi(() => api('/api-credentials'), [nonce]);
  const keys = (data as any)?.items || [];

  async function generate() {
    if (!label.trim()) return alert('Informe um nome para a chave.');
    setBusy(true);
    try {
      const res = await api('/api-credentials', { method: 'POST', body: JSON.stringify({ label: label.trim(), role }) });
      setNewToken(res.token);
      setLabel('');
      setNonce((v) => v + 1);
    } catch (e: any) {
      alert(`Falha ao gerar chave: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revogar esta API key? Qualquer integração usando-a vai parar de funcionar.')) return;
    setBusy(true);
    try {
      await api(`/api-credentials/${id}/revoke`, { method: 'PATCH', body: '{}' });
      setNonce((v) => v + 1);
    } catch (e: any) {
      alert(`Falha ao revogar: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid">
      <PageHeader title="Configurações" subtitle="Gerencie as configurações do sistema" />

      <Panel title="Integração Tiny ERP" subtitle="Status real da integração" right={<StatusBadge status="Não implementada" />}>
        <div className="empty-state">
          A integração com o Tiny ERP ainda não está funcional: os endpoints usados no código não correspondem à API v3 real do Tiny
          e o fluxo OAuth2 (client_id/client_secret + refresh token) exigido pela v3 não está implementado. Os workers de sync
          (tinySyncOnce.js, trackingOnce.js) existem no repositório mas não estão agendados em produção por esse motivo.
        </div>
      </Panel>

      <Panel title="API Keys" subtitle="Chaves de acesso para integrações externas (autenticação via header x-api-key)">
        <div className="grid">
          {newToken ? (
            <div className="empty-state" style={{ borderColor: '#3fae6b' }}>
              Chave gerada — copie agora, ela não será exibida novamente: <span className="mono">{newToken}</span>
              <div className="filter-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn" onClick={() => setNewToken('')}>Fechar</button>
              </div>
            </div>
          ) : null}

          {loading ? <LoadingState text="Carregando chaves..." /> : error ? <ErrorState text={error} /> : keys.length === 0 ? <EmptyState /> : (
            keys.map((k: any) => (
              <div key={k.id} className="panel" style={{ borderRadius: 10 }}>
                <div className="panel-body" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <strong>{k.label}</strong>
                    <div><small>role: {k.role} · criada em {new Date(k.created_at).toLocaleDateString()} · último uso: {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'nunca'}</small></div>
                  </div>
                  <div className="row-actions">
                    <StatusBadge status={k.is_active ? 'Ativa' : 'Revogada'} />
                    {k.is_active ? <button className="btn danger" disabled={busy} onClick={() => revoke(k.id)}>Revogar</button> : null}
                  </div>
                </div>
              </div>
            ))
          )}

          <div className="filter-row">
            <input className="input" placeholder="Nome da nova chave (ex: integração marketplace X)" value={label} onChange={(e) => setLabel(e.target.value)} />
            <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="integracao">integração</option>
              <option value="operador">operador</option>
              <option value="financeiro">financeiro</option>
              <option value="visualizador">visualizador</option>
              <option value="admin">admin</option>
            </select>
            <button className="btn primary" disabled={busy} onClick={generate}>Gerar Nova API Key</button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
