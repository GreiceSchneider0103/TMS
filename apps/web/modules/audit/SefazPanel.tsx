'use client';
import { useState } from 'react';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { readFileBase64 } from '@/services/files';
import { formatDate, formatDateTime, formatDocument } from '@/services/format';

function certStatus(validTo?: string | null) {
  if (!validTo) return 'Sem certificado';
  const days = Math.floor((new Date(validTo).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'Vencido';
  if (days <= 30) return `Vence em ${days} dia(s)`;
  return 'Válido';
}

export function SefazPanel() {
  const { data, loading, error, reload } = useApi(() => api('/ctes/sefaz-status'), []);
  const [certCompany, setCertCompany] = useState<any>(null);
  const [busyId, setBusyId] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const items: any[] = (data as any)?.items || [];
  const env = (data as any)?.environment;

  async function sync(c: any) {
    setBusyId(c.company_id);
    setFeedback(null);
    try {
      const res = await api('/ctes/sefaz-sync', { method: 'POST', body: JSON.stringify({ companyId: c.company_id }) });
      const none = res.sefazStatus === '137';
      setFeedback({
        ok: !res.errors?.length,
        text: none
          ? 'A SEFAZ não tem CT-es novos para este CNPJ. Uma nova consulta só é permitida daqui a 1 hora.'
          : `SEFAZ: ${res.sefazMessage || 'consulta concluída'}. ${res.imported} CT-e(s) novo(s), ${res.updated} atualizado(s), ${res.matched} vinculado(s) automaticamente.${res.errors?.length ? ` ${res.errors.length} com erro.` : ''}`
      });
      reload();
    } catch (e: any) {
      setFeedback({ ok: false, text: e.message });
    } finally {
      setBusyId('');
    }
  }

  async function removeCert(c: any) {
    if (!window.confirm(`Remover o certificado digital de ${c.trade_name}?`)) return;
    try {
      await api(`/companies/${c.company_id}/certificate`, { method: 'DELETE' });
      reload();
    } catch (e: any) {
      setFeedback({ ok: false, text: e.message });
    }
  }

  return (
    <div className="grid">
      <div className="notice info">
        A busca na SEFAZ usa o certificado digital A1 (e-CNPJ) de cada empresa para baixar todos os CT-es em que o CNPJ aparece
        (como tomador, remetente ou destinatário). O certificado e a senha ficam guardados criptografados.
        {env === 'homologacao' ? ' Ambiente atual: homologação (testes).' : ''}
      </div>
      {feedback ? <div className={`notice ${feedback.ok ? 'ok' : 'err'}`}>{feedback.text}</div> : null}

      <Panel title="Empresas" right={<button className="btn sm" onClick={reload}><Icon name="refresh" />Atualizar</button>}>
        {loading ? <LoadingState /> : error ? <ErrorState text={error} /> : items.length === 0 ? <EmptyState text="Cadastre uma empresa em Cadastros → Empresas para usar a busca na SEFAZ." /> : (
          <div className="table-wrap">
            <table className="stack">
              <thead><tr><th>Empresa</th><th>Certificado</th><th>Última consulta</th><th>Resultado</th><th></th></tr></thead>
              <tbody>
                {items.map((c) => {
                  const status = certStatus(c.certificate_valid_to);
                  const waiting = c.next_allowed_at && new Date(c.next_allowed_at) > new Date();
                  return (
                    <tr key={c.company_id}>
                      <td className="cell-title">{c.trade_name}<span className="sub">{formatDocument(c.cnpj)} · {c.state}</span></td>
                      <td data-label="Certificado">
                        <StatusBadge status={status} />
                        {c.certificate_valid_to ? <span className="sub">validade {formatDate(c.certificate_valid_to)}</span> : null}
                      </td>
                      <td data-label="Última consulta">{c.last_run_at ? formatDateTime(c.last_run_at) : 'Nunca'}</td>
                      <td data-label="Resultado" className="muted">{c.last_message || '-'}{waiting ? <span className="sub">nova consulta após {formatDateTime(c.next_allowed_at)}</span> : null}</td>
                      <td data-label="" className="text-right">
                        <div className="row-actions">
                          <button className="btn sm" onClick={() => setCertCompany(c)}>{c.certificate_valid_to ? 'Trocar certificado' : 'Enviar certificado'}</button>
                          {c.certificate_valid_to ? <button className="btn ghost sm" style={{ color: 'var(--red)' }} title="Remover certificado" aria-label="Remover certificado" onClick={() => removeCert(c)}><Icon name="trash" /></button> : null}
                          <button className="btn primary sm" disabled={!c.certificate_valid_to || status === 'Vencido' || busyId === c.company_id || waiting} onClick={() => sync(c)}>
                            {busyId === c.company_id ? 'Consultando...' : 'Buscar CT-es na SEFAZ'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {certCompany ? <CertificateModal company={certCompany} onClose={() => setCertCompany(null)} onSaved={() => { setCertCompany(null); setFeedback({ ok: true, text: 'Certificado salvo.' }); reload(); }} /> : null}
    </div>
  );
}

function CertificateModal({ company, onClose, onSaved }: { company: any; onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!file) return setError('Escolha o arquivo do certificado.');
    setBusy(true);
    setError('');
    try {
      await api(`/companies/${company.company_id}/certificate`, { method: 'POST', body: JSON.stringify({ pfxBase64: await readFileBase64(file), password }) });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Certificado digital — ${company.trade_name}`} onClose={onClose} size="sm">
      <Field label="Arquivo do certificado A1" required hint="Formato .pfx ou .p12">
        <input className="input" type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </Field>
      <Field label="Senha do certificado" required>
        <input className="input" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error ? <div className="notice err">{error}</div> : null}
      <div className="form-actions">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" disabled={busy || !file || !password} onClick={save}>{busy ? 'Validando...' : 'Salvar certificado'}</button>
      </div>
    </Modal>
  );
}
