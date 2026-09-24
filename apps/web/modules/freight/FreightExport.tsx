'use client';
import { useState } from 'react';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { Panel } from '@/components/ui/Panel';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { downloadBase64 } from '@/services/files';
import { CHANNEL_OPTIONS } from '@/services/brazil';
import { formatNumber } from '@/services/format';

// Gera uma planilha CEP x peso a partir das tabelas publicadas + regras do canal,
// para subir em plataformas que aceitam tabela de frete (ERP, hub, marketplace).
export function FreightExport() {
  const carriers = useApi(() => api('/carriers'), []);
  const [channel, setChannel] = useState('');
  const [carrierId, setCarrierId] = useState('');
  const [invoiceValue, setInvoiceValue] = useState('');
  const [bands, setBands] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function generate() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api('/freight-tables/export', {
        method: 'POST',
        body: JSON.stringify({
          channel: channel || null,
          channelLabel: CHANNEL_OPTIONS.find((c) => c.value === channel)?.label || 'todos os canais',
          carrierId: carrierId || null,
          invoiceValue: invoiceValue || 0,
          weightBands: bands.trim() || null
        })
      });
      downloadBase64(res.fileName, res.mimeType, res.contentBase64);
      setFeedback({ ok: true, text: `Planilha gerada com ${formatNumber(res.summary.rows)} linha(s) e ${res.summary.bands.length} faixa(s) de peso.` });
    } catch (e: any) {
      setFeedback({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Exportar para outras plataformas" subtitle="Tabela CEP × peso com valor e prazo, a partir das tabelas publicadas e das regras de frete">
      <div className="grid">
        <div className="filter-row">
          <Field label="Canal" hint="Aplica as regras de frete deste canal">
            <select className="select" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">Sem regras de canal</option>
              {CHANNEL_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Transportadora" hint="Melhor opção = menor preço entre as tabelas">
            <select className="select" value={carrierId} onChange={(e) => setCarrierId(e.target.value)}>
              <option value="">Melhor opção</option>
              {((carriers.data as any)?.items || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Valor de NF de referência (R$)" hint="Para ad valorem e GRIS (% da nota)">
            <input className="input" inputMode="decimal" placeholder="Ex.: 800" value={invoiceValue} onChange={(e) => setInvoiceValue(e.target.value)} />
          </Field>
          <Field label="Faixas de peso (kg)" hint="Em branco = as mesmas das tabelas" className="grow">
            <input className="input" placeholder="Ex.: 0,5; 1; 2; 5; 10; 30" value={bands} onChange={(e) => setBands(e.target.value)} />
          </Field>
          <button className="btn primary" disabled={busy} onClick={generate}><Icon name="download" />{busy ? 'Gerando...' : 'Gerar planilha'}</button>
        </div>
        {feedback ? <div className={`notice ${feedback.ok ? 'ok' : 'err'}`}>{feedback.text}</div> : null}
        <p className="muted small" style={{ margin: 0 }}>
          A planilha sai num formato padrão (CEP inicial, CEP final, UF, peso inicial, peso final, valor, prazo, transportadora).
          Se a plataforma exigir um modelo específico, envie o modelo dela para adaptarmos as colunas.
        </p>
      </div>
    </Panel>
  );
}
