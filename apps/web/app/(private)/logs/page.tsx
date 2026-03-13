'use client';
import { useApi } from '@/hooks/useApi';
import { api } from '@/services/api';
import { JsonView } from '@/components/JsonView';

export default function LogsPage() {
  const sync = useApi(() => api('/logs/sync?limit=50'), []);
  const hooks = useApi(() => api('/logs/webhooks?limit=50'), []);
  const audit = useApi(() => api('/logs/audit?limit=50'), []);

  return (
    <div className="grid">
      <div className="card"><h2>sync_jobs</h2><JsonView data={(sync.data as any)?.items || sync.error || 'Carregando...'} /></div>
      <div className="card"><h2>webhook_logs</h2><JsonView data={(hooks.data as any)?.items || hooks.error || 'Carregando...'} /></div>
      <div className="card"><h2>erros/audit recentes</h2><JsonView data={(audit.data as any)?.items || audit.error || 'Carregando...'} /></div>
    </div>
  );
}
