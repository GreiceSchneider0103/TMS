'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { AuditTrail } from '@/modules/logs/AuditTrail';
import { IntegrationLogs } from '@/modules/logs/IntegrationLogs';
import { IntegrationIssues } from '@/modules/logs/IntegrationIssues';

const TABS = [
  { key: 'pendencias', label: 'Pendências de integração' },
  { key: 'acoes', label: 'Ações no sistema' },
  { key: 'integracoes', label: 'Histórico de integrações' }
];

function LogsInner() {
  const router = useRouter();
  const current = useSearchParams().get('tab');
  const tab = TABS.some((t) => t.key === current) ? current : 'pendencias';

  return (
    <div className="grid">
      <PageHeader title="Logs" subtitle="Quem fez o quê no sistema e o histórico das integrações" />
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => router.replace(`/logs?tab=${t.key}`)}>{t.label}</button>
        ))}
      </div>
      {tab === 'pendencias' ? <IntegrationIssues /> : tab === 'acoes' ? <AuditTrail /> : <IntegrationLogs />}
    </div>
  );
}

export default function LogsPage() {
  return (
    <Suspense>
      <LogsInner />
    </Suspense>
  );
}
