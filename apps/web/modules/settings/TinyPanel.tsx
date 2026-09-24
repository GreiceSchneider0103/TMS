'use client';
import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { formatDateTime } from '@/services/format';

type Feedback = { ok: boolean; text: string } | null;
type Settings = {
  importOrders: boolean; importSituacoes: number[]; daysBack: number; importProducts: boolean; syncMeasures: boolean;
  importInvoices: boolean; updateStatus: boolean; autoSync: boolean; companyId: string | null;
};

const SITUACOES = [
  { value: '0', label: 'Em aberto' }, { value: '3', label: 'Aprovado' }, { value: '4', label: 'Preparando envio' },
  { value: '1', label: 'Faturado' }, { value: '7', label: 'Pronto para envio' }, { value: '8', label: 'Dados incompletos' }
];

const OPTIONS: { key: keyof Settings; label: string; hint: string }[] = [
  { key: 'importOrders', label: 'Baixar pedidos', hint: 'Traz os pedidos de venda do Tiny para cotar e acompanhar a entrega.' },
  { key: 'autoSync', label: 'Sincronizar automaticamente', hint: 'Busca pedidos novos a cada 30 minutos enquanto o sistema está no ar.' },
  { key: 'importProducts', label: 'Importar produtos', hint: 'Cadastra os produtos novos que aparecem nos pedidos, com peso e medidas do Tiny.' },
  { key: 'syncMeasures', label: 'Atualizar medidas', hint: 'Substitui peso e medidas dos produtos já cadastrados pelos valores do Tiny.' },
  { key: 'importInvoices', label: 'Baixar NF de venda', hint: 'Baixa o XML da nota emitida no Tiny e liga ao pedido (usado na auditoria de frete).' },
  { key: 'updateStatus', label: 'Atualizar situação no Tiny', hint: 'Ao despachar ou entregar no TMS, muda o pedido no Tiny para “Enviado” ou “Entregue”.' }
];

export function TinyPanel() {
  const conn = useApi(() => api('/integrations/tiny'), []);
  const companies = useApi(() => api('/companies'), []);
  const c: any = conn.data || null;
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!c) return;
    setClientId(c.clientId || '');
    setSettings(c.settings);
  }, [c]);

  // A janela de autorização avisa quando termina; recarrega o status.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => { if (e.data === 'tiny-connected') { conn.reload(); setFeedback({ ok: true, text: 'Tiny conectado com sucesso.' }); } };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [conn]);

  const companyList: any[] = (companies.data as any)?.items || (Array.isArray(companies.data) ? (companies.data as any) : []);
  const set = (k: keyof Settings, v: any) => setSettings((s) => (s ? { ...s, [k]: v } : s));

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setFeedback(null);
    try { await fn(); } catch (e: any) { setFeedback({ ok: false, text: e.message }); } finally { setBusy(''); }
  }

  const save = () => run('save', async () => {
    if (!clientId.trim()) throw new Error('Informe o Client ID do aplicativo do Tiny.');
    if (!c?.hasSecret && !clientSecret.trim()) throw new Error('Informe o Client Secret do aplicativo do Tiny.');
    await api('/integrations/tiny', { method: 'PATCH', body: JSON.stringify({ clientId: clientId.trim(), ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}), settings }) });
    setClientSecret('');
    conn.reload();
    setFeedback({ ok: true, text: c?.connected ? 'Configurações salvas.' : 'Dados salvos. Agora clique em “Autorizar no Tiny”.' });
  });

  const authorize = () => run('auth', async () => {
    const res = await api('/integrations/tiny/auth-url');
    window.open(res.url, 'tiny-auth', 'width=520,height=720');
    setFeedback({ ok: true, text: 'Entre com o usuário do Tiny na janela que abriu e confirme o acesso. Depois volte aqui.' });
  });

  const disconnect = () => run('disconnect', async () => {
    if (!confirm('Desconectar o Tiny? Os pedidos já importados continuam no TMS.')) return;
    await api('/integrations/tiny', { method: 'DELETE' });
    conn.reload();
    setFeedback({ ok: true, text: 'Tiny desconectado.' });
  });

  const sync = (kind: 'orders' | 'products') => run(kind, async () => {
    const r = await api('/integrations/tiny/sync', { method: 'POST', body: JSON.stringify({ kind }) });
    const errors = r.errors?.length ? ` ${r.errors.length} com erro (veja Logs > Pendências).` : '';
    setFeedback({
      ok: !r.errors?.length,
      text: kind === 'orders'
        ? `${r.found} pedido(s) encontrado(s): ${r.imported} novo(s), ${r.updated} atualizado(s), ${r.skipped} sem mudança, ${r.quoted} cotado(s), ${r.invoices} NF(s) baixada(s).${errors}`
        : `${r.found} produto(s) no Tiny: ${r.created} cadastrado(s), ${r.updated} atualizado(s), ${r.withoutMeasures} sem peso/medidas.${errors}`
    });
    conn.reload();
  });

  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 2000); } catch { setCopied(''); }
  }

  const statusLabel = !c ? '' : c.connected ? 'Conectado' : c.status === 'erro' ? 'Erro' : c.status === 'desconectado' ? 'Desconectado' : 'Não conectado';

  return (
    <Panel title="Tiny ERP" subtitle="Pedidos, produtos, notas fiscais e situação do pedido pela API v3 do Tiny" right={c ? <StatusBadge status={statusLabel} /> : null}>
      {conn.loading && !c ? <LoadingState text="Carregando integração..." /> : conn.error ? <ErrorState text={conn.error} /> : c && settings ? (
        <div className="grid">
          {c.lastError && !c.connected ? <div className="notice err">{c.lastError}</div> : null}

          <details className="help-box" open={!c.configured}>
            <summary>Como conectar</summary>
            <ol className="small">
              <li>No Tiny, abra <strong>Configurações &gt; Aplicativos</strong> e crie um aplicativo (API v3).</li>
              <li>Em “URL de redirecionamento”, cole o endereço abaixo.</li>
              <li>Copie o Client ID e o Client Secret gerados pelo Tiny para os campos abaixo e salve.</li>
              <li>Clique em <strong>Autorizar no Tiny</strong> e confirme com um usuário do Tiny.</li>
              <li>Opcional: em <strong>Configurações &gt; Webhooks</strong> do Tiny, use a URL de notificações para receber pedidos na hora.</li>
            </ol>
          </details>

          <div className="filter-row">
            <Field label="URL de redirecionamento" className="grow" group>
              <div className="secret-box" style={{ margin: 0 }}>
                <code className="mono">{c.redirectUri}</code>
                <button type="button" className="btn sm" onClick={() => copy(c.redirectUri, 'redirect')}><Icon name="copy" />{copied === 'redirect' ? 'Copiada' : 'Copiar'}</button>
              </div>
            </Field>
          </div>
          {c.webhookUrl ? (
            <div className="filter-row">
              <Field label="URL de notificações (webhook)" className="grow" hint="Não compartilhe: quem tiver este endereço pode enviar notificações para a sua conta." group>
                <div className="secret-box" style={{ margin: 0 }}>
                  <code className="mono">{c.webhookUrl}</code>
                  <button type="button" className="btn sm" onClick={() => copy(c.webhookUrl, 'webhook')}><Icon name="copy" />{copied === 'webhook' ? 'Copiada' : 'Copiar'}</button>
                </div>
              </Field>
            </div>
          ) : null}

          <div className="filter-row">
            <Field label="Client ID" required className="grow">
              <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Client Secret" required={!c.hasSecret} className="grow">
              <input className="input" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="new-password" placeholder={c.hasSecret ? 'Já cadastrado (preencha só para trocar)' : ''} />
            </Field>
          </div>

          <div className="tiny-options">
            {OPTIONS.map((o) => (
              <label key={o.key} className="check option-card">
                <input type="checkbox" checked={Boolean(settings[o.key])} onChange={(e) => set(o.key, e.target.checked)} />
                <span><strong>{o.label}</strong><small className="muted">{o.hint}</small></span>
              </label>
            ))}
          </div>

          <div className="filter-row">
            <Field label="Situações do pedido que entram no TMS" className="grow" group>
              <MultiSelect
                options={SITUACOES}
                value={(settings.importSituacoes || []).map(String)}
                onChange={(v) => set('importSituacoes', v.map(Number))}
                allLabel="Escolha ao menos uma"
              />
            </Field>
            <Field label="Buscar pedidos dos últimos (dias)">
              <input className="input" type="number" min={1} max={90} value={settings.daysBack} onChange={(e) => set('daysBack', Number(e.target.value))} />
            </Field>
            <Field label="Empresa dos produtos importados">
              <select className="select" value={settings.companyId || ''} onChange={(e) => set('companyId', e.target.value || null)}>
                <option value="">Sem empresa definida</option>
                {companyList.map((co: any) => <option key={co.id} value={co.id}>{co.trade_name || co.name || co.legal_name}</option>)}
              </select>
            </Field>
          </div>

          {c.connected ? (
            <p className="muted small">
              Conectado em {formatDateTime(c.connectedAt)} · Pedidos sincronizados: {c.lastOrderSyncAt ? formatDateTime(c.lastOrderSyncAt) : 'nunca'} · Produtos: {c.lastProductSyncAt ? formatDateTime(c.lastProductSyncAt) : 'nunca'}
            </p>
          ) : null}
          {feedback ? <div className={`notice ${feedback.ok ? 'ok' : 'err'}`}>{feedback.text}</div> : null}

          <div className="form-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            <button className="btn primary" disabled={Boolean(busy)} onClick={save}>{busy === 'save' ? 'Salvando...' : 'Salvar'}</button>
            <button className="btn" disabled={Boolean(busy) || !c.configured} onClick={authorize} title={c.configured ? '' : 'Salve o Client ID e o Client Secret primeiro'}>
              <Icon name="plus" />{c.connected ? 'Autorizar de novo' : 'Autorizar no Tiny'}
            </button>
            <button className="btn" disabled={Boolean(busy) || !c.connected} onClick={() => sync('orders')}><Icon name="refresh" />{busy === 'orders' ? 'Buscando pedidos...' : 'Sincronizar pedidos'}</button>
            <button className="btn" disabled={Boolean(busy) || !c.connected} onClick={() => sync('products')}><Icon name="refresh" />{busy === 'products' ? 'Importando produtos...' : 'Importar produtos'}</button>
            {c.connected ? <button className="btn ghost" disabled={Boolean(busy)} onClick={disconnect}>Desconectar</button> : null}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
