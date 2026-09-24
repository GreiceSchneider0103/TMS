'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reconciliation } from '@/modules/audit/Reconciliation';
import { CteList } from '@/modules/audit/CteList';
import { SefazPanel } from '@/modules/audit/SefazPanel';

const TABS = [
  { key: 'conciliacao', label: 'Conciliação' },
  { key: 'ctes', label: 'CT-es' },
  { key: 'sefaz', label: 'Certificado e SEFAZ' }
];

function AuditInner() {
  const router = useRouter();
  const current = useSearchParams().get('tab');
  const tab = TABS.some((t) => t.key === current) ? current : 'conciliacao';
  const go = (key: string) => router.replace(`/audit?tab=${key}`);

  return (
    <div className="grid">
      <PageHeader title="Auditoria de frete" subtitle="Frete cobrado × contratado × pago, conferido com os CT-es das transportadoras" />
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => go(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === 'conciliacao' ? <Reconciliation onGoToCtes={() => go('ctes')} /> : tab === 'ctes' ? <CteList /> : <SefazPanel />}
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense>
      <AuditInner />
    </Suspense>
  );
}
