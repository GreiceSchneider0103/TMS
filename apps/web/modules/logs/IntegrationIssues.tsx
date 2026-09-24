'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { Panel } from '@/components/ui/Panel';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { channelLabel, eventLabel, formatDateTime } from '@/services/format';

const REASONS: [string, string, string][] = [
  ['transportadora_nao_mapeada', 'Transportadora não mapeada', 'Cadastre o de-para da transportadora'],
  ['cep_invalido', 'CEP inválido', 'Corrija o CEP no pedido'],
  ['sem_cotacao', 'Destino sem tabela', 'Nenhuma tabela publicada atende o CEP/peso'],
  ['erro_integracao', 'Erro na integração', 'Falha ao ler o pedido do canal']
];
const reasonLabel = (r: string) => REASONS.find(([k]) => k === r)?.[1] || r;

export function IntegrationIssues() {
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('aberto');
  const [busyId, setBusyId] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const qs = new URLSearchParams({ status, ...(reason ? { reason } : {}) }).toString();
  const { data, loading, error, reload } = useApi(() => api(`/integration-issues?${qs}`), [qs]);
  const items: any[] = (data as any)?.items || [];
  const counts: Record<string, number> = (data as any)?.counts || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  async function act(issue: any, action: 'reprocess' | 'discard') {
    setBusyId(issue.id);
    setFeedback(null);
    try {
      const res = await api(`/integration-issues/${issue.id}/${action}`, { method: 'POST', body: '{}' });
      setFeedback(action === 'discard'
        ? { ok: true, text: 'Pendência descartada.' }
        : res.resolved ? { ok: true, text: `Pedido #${issue.order_number || issue.external_ref} reprocessado: pendência resolvida.` } : { ok: false, text: 'O problema continua. Corrija o cadastro ou o pedido e tente de novo.' });
      reload();
    } catch (e: any) {
      setFeedback({ ok: false, text: e.message });
    } finally {
      setBusyId('');
    }
  }

  async function reprocessAll() {
    setBusyId('all');
    setFeedback(null);
    try {
      const res = await api('/integration-issues/reprocess-all', { method: 'POST', body: JSON.stringify({ reason: reason || undefined }) });
      setFeedback({ ok: true, text: `${res.processed} pedido(s) reprocessado(s), ${res.resolved} resolvido(s).` });
      reload();
    } catch (e: any) {
      setFeedback({ ok: false, text: e.message });
    } finally {
      setBusyId('');
    }
  }

  function fixLink(i: any) {
    if (i.reason === 'transportadora_nao_mapeada') {
      const q = new URLSearchParams({ tab: 'carrier-mappings', novo: i.details?.carrier || '', canal: i.details?.channel || i.channel || '' });
      return <Link className="btn sm" href={`/cadastros?${q.toString()}`}>Criar de-para</Link>;
    }
    if (i.order_id && (i.reason === 'cep_invalido' || i.reason === 'sem_cotacao')) return <Link className="btn sm" href={`/orders/${i.order_id}`}>Abrir pedido</Link>;
    return null;
  }

  return (
    <div className="grid">
      <div className="kpi-grid">
        <button type="button" className={`stat-card ${total ? 'error' : 'success'}`} style={{ textAlign: 'left', cursor: 'pointer', outline: reason === '' ? '2px solid var(--brand)' : 'none' }} onClick={() => setReason('')}>
          <h4>Pendências em aberto</h4><strong>{total}</strong>
        </button>
        {REASONS.map(([k, label]) => (
          <button key={k} type="button" className={`stat-card ${counts[k] ? 'warning' : 'neutral'}`} style={{ textAlign: 'left', cursor: 'pointer', outline: reason === k ? '2px solid var(--brand)' : 'none' }} onClick={() => setReason(reason === k ? '' : k)}>
            <h4>{label}</h4><strong>{counts[k] || 0}</strong>
          </button>
        ))}
      </div>
      {(data as any)?.ignoredOrders ? <p className="muted small" style={{ margin: 0 }}>{(data as any).ignoredOrders} pedido(s) com frete gerenciado pelo canal (ignorados pelo de-para).</p> : null}

      {feedback ? <div className={`notice ${feedback.ok ? 'ok' : 'err'}`}>{feedback.text}</div> : null}

      <Panel title={reason ? reasonLabel(reason) : 'Pendências de integração'} subtitle="Pedidos recebidos dos canais que precisam de ajuste antes de serem cotados" right={
        <div className="row-actions">
          <select className="select" style={{ minHeight: 30, width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="aberto">Em aberto</option><option value="resolvido">Resolvidas</option><option value="descartado">Descartadas</option>
          </select>
          {status === 'aberto' && items.length ? <button className="btn sm" disabled={busyId === 'all'} onClick={reprocessAll}><Icon name="refresh" />{busyId === 'all' ? 'Reprocessando...' : 'Reprocessar todas'}</button> : null}
        </div>
      }>
        {loading ? <LoadingState /> : error ? <ErrorState text={error} /> : items.length === 0 ? <EmptyState text={status === 'aberto' ? 'Nenhuma pendência. Tudo certo com as integrações.' : 'Nenhum registro.'} /> : (
          <div className="table-wrap">
            <table className="stack">
              <thead><tr><th>Pedido</th><th>Motivo</th><th>Última ocorrência</th><th></th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="cell-title">
                      {i.order_id ? <Link href={`/orders/${i.order_id}`} style={{ color: 'var(--brand)', fontWeight: 600 }}>#{i.order_number || i.external_ref}</Link> : <strong>{i.external_ref || '-'}</strong>}
                      <span className="sub">{i.channel ? channelLabel(i.channel) : eventLabel(i.source)}</span>
                    </td>
                    <td data-label="Motivo"><span className={`badge ${i.status === 'aberto' ? 'warning' : 'neutral'}`}>{reasonLabel(i.reason)}</span><span className="sub">{i.message}</span></td>
                    <td data-label="Última ocorrência" className="nowrap">{formatDateTime(i.last_seen_at)}<span className="sub">{i.attempts} tentativa(s)</span></td>
                    <td data-label="" className="text-right">
                      {i.status === 'aberto' ? (
                        <div className="row-actions">
                          {fixLink(i)}
                          {i.order_id ? <button className="btn sm" disabled={busyId === i.id} onClick={() => act(i, 'reprocess')}>Reprocessar</button> : null}
                          <button className="btn ghost sm" disabled={busyId === i.id} onClick={() => act(i, 'discard')}>Descartar</button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
