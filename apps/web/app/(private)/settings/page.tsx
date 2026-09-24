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
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { formatDate, formatDateTime, roleLabel } from '@/services/format';
import { TinyPanel } from '@/modules/settings/TinyPanel';

type Feedback = { ok: boolean; text: string } | null;

export default function SettingsPage() {
  return (
    <div className="grid">
      <PageHeader title="Configurações" subtitle="Integrações e chaves de acesso" />
      <ShopeePanel />
      <TinyPanel />
      <ApiKeysPanel />
    </div>
  );
}

function ShopeePanel() {
  const shops = useApi(() => api('/integrations/shopee/shops'), []);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const items: any[] = (shops.data as any)?.items || [];
  const active = items.filter((s) => s.is_active);

  async function connect() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api('/integrations/shopee/auth-url');
      window.open(res.url, '_blank', 'noopener');
      setFeedback({ ok: true, text: 'Autorize o acesso na janela da Shopee que foi aberta. Depois clique em “Atualizar” para ver a loja conectada.' });
    } catch (e: any) {
      setFeedback({ ok: false, text: `Não foi possível iniciar a conexão com a Shopee: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api('/integrations/shopee/sync', { method: 'POST', body: '{}' });
      setFeedback({ ok: true, text: `Sincronização concluída: ${res.synced ?? 0} pedido(s) importado(s), ${res.quoted ?? 0} cotado(s).` });
      shops.reload();
    } catch (e: any) {
      setFeedback({ ok: false, text: `Falha ao sincronizar pedidos da Shopee: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Shopee"
      subtitle="Pedidos, cotação de frete e despacho integrados à Shopee"
      right={<StatusBadge status={active.length ? 'Conectada' : 'Desconectada'} />}
    >
      <div className="grid">
        {shops.loading ? <LoadingState text="Carregando lojas..." /> : shops.error ? <ErrorState text={shops.error} /> : items.length === 0 ? (
          <EmptyState text="Nenhuma loja Shopee conectada." />
        ) : (
          <div className="table-wrap" style={{ margin: 0, border: '1px solid var(--line)', borderRadius: 8 }}>
            <table>
              <thead><tr><th>Loja</th><th>Ambiente</th><th>Situação</th><th>Última sincronização</th></tr></thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id}>
                    <td>{s.shop_name || `Loja ${s.shop_id}`}</td>
                    <td><StatusBadge status={s.is_sandbox ? 'Sandbox' : 'Produção'} /></td>
                    <td><StatusBadge status={s.is_active ? 'Ativa' : 'Inativa'} /></td>
                    <td className="nowrap">{s.last_synced_at ? formatDateTime(s.last_synced_at) : 'Nunca'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {feedback ? <div className={`notice ${feedback.ok ? 'ok' : 'err'}`}>{feedback.text}</div> : null}
        <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn primary" disabled={busy || !active.length} onClick={sync}><Icon name="refresh" />{busy ? 'Aguarde...' : 'Sincronizar pedidos agora'}</button>
          <button className="btn" disabled={busy} onClick={connect}><Icon name="plus" />Conectar loja</button>
          <button className="btn ghost" disabled={busy} onClick={shops.reload}>Atualizar</button>
        </div>
      </div>
    </Panel>
  );
}

function ApiKeysPanel() {
  const [label, setLabel] = useState('');
  const [role, setRole] = useState('integracao');
  const [newToken, setNewToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const { data, loading, error, reload } = useApi(() => api('/api-credentials'), []);
  const keys: any[] = (data as any)?.items || [];

  async function generate() {
    if (!label.trim()) return setFeedback({ ok: false, text: 'Informe um nome para a chave.' });
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api('/api-credentials', { method: 'POST', body: JSON.stringify({ label: label.trim(), role }) });
      setNewToken(res.token);
      setCopied(false);
      setLabel('');
      reload();
    } catch (e: any) {
      setFeedback({ ok: false, text: `Não foi possível gerar a chave: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(k: any) {
    if (!confirm(`Revogar a chave "${k.label}"? Qualquer sistema que use essa chave vai parar de funcionar.`)) return;
    setBusy(true);
    setFeedback(null);
    try {
      await api(`/api-credentials/${k.id}/revoke`, { method: 'PATCH', body: '{}' });
      setFeedback({ ok: true, text: `Chave "${k.label}" revogada.` });
      reload();
    } catch (e: any) {
      setFeedback({ ok: false, text: `Não foi possível revogar a chave: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Panel title="Chaves de acesso" subtitle="Usadas para entrar no sistema e para conectar sistemas externos">
      <div className="grid">
        {newToken ? (
          <div className="notice ok">
            <strong>Chave gerada.</strong> Copie agora — por segurança ela não será exibida novamente.
            <div className="secret-box">
              <code className="mono">{newToken}</code>
              <button className="btn sm" onClick={copy}><Icon name="copy" />{copied ? 'Copiada' : 'Copiar'}</button>
              <button className="btn ghost sm" onClick={() => setNewToken('')}>Fechar</button>
            </div>
          </div>
        ) : null}
        {feedback ? <div className={`notice ${feedback.ok ? 'ok' : 'err'}`}>{feedback.text}</div> : null}

        {loading ? <LoadingState text="Carregando chaves..." /> : error ? <ErrorState text={error} /> : keys.length === 0 ? <EmptyState text="Nenhuma chave cadastrada." /> : (
          <div className="table-wrap" style={{ margin: 0, border: '1px solid var(--line)', borderRadius: 8 }}>
            <table>
              <thead><tr><th>Nome</th><th>Perfil</th><th>Criada em</th><th>Último uso</th><th>Situação</th><th></th></tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td>{k.label}</td>
                    <td>{roleLabel(k.role)}</td>
                    <td className="nowrap">{formatDate(k.created_at)}</td>
                    <td className="nowrap">{k.last_used_at ? formatDateTime(k.last_used_at) : 'Nunca'}</td>
                    <td><StatusBadge status={k.is_active ? 'Ativa' : 'Revogada'} /></td>
                    <td className="text-right">{k.is_active ? <button className="btn danger sm" disabled={busy} onClick={() => revoke(k)}>Revogar</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="filter-row">
          <Field label="Nome da nova chave" className="grow">
            <input className="input" placeholder="Ex.: Integração marketplace X" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Perfil">
            <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="integracao">Integração</option>
              <option value="operador">Operador logístico</option>
              <option value="financeiro">Financeiro</option>
              <option value="visualizador">Somente leitura</option>
              <option value="admin">Administrador</option>
            </select>
          </Field>
          <button className="btn primary" disabled={busy} onClick={generate}><Icon name="plus" />Gerar chave</button>
        </div>
      </div>
    </Panel>
  );
}
