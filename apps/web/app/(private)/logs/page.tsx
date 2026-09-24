'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { AuditTrail } from '@/modules/logs/AuditTrail';
import { IntegrationLogs } from '@/modules/logs/IntegrationLogs';

const TABS = [
  { key: 'acoes', label: 'Ações no sistema' },
  { key: 'integracoes', label: 'Histórico de integrações' }
];

function LogsInner() {
  const router = useRouter();
  const tab = useSearchParams().get('tab') === 'integracoes' ? 'integracoes' : 'acoes';

  return (
    <div className="grid">
      <PageHeader title="Logs" subtitle="Quem fez o quê no sistema e o histórico das integrações" />
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => router.replace(`/logs?tab=${t.key}`)}>{t.label}</button>
        ))}
      </div>
      {tab === 'acoes' ? <AuditTrail /> : <IntegrationLogs />}
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
