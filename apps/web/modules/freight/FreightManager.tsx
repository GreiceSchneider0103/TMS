'use client';
import { useState } from 'react';
import { api } from '@/services/api';
import { JsonView } from '@/components/JsonView';

export function FreightManager() {
  const [out, setOut] = useState<any>(null);
  const [versionId, setVersionId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function toBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',').pop() || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function importWorkbook(file: File) {
    setBusy(true);
    setMessage('Importando planilha...');
    try {
      const base64Content = await toBase64(file);
      const res = await api('/freight-tables/import', { method: 'POST', body: JSON.stringify({ base64Content }) });
      const importedVersionId = res?.version?.id ? String(res.version.id) : '';
      setOut(res);
      setVersionId(importedVersionId);
      if (importedVersionId) {
        setMessage(`Import concluído. Versão selecionada: ${importedVersionId}`);
      } else {
        setMessage('Import concluído, mas sem version.id retornado. Verifique o resultado antes de publicar.');
      }
    } catch (error: any) {
      setMessage(`Falha no import: ${error?.message || 'erro inesperado'}`);
    } finally {
      setBusy(false);
    }
  }

  async function runVersionAction(action: 'publish' | 'rollback') {
    const trimmed = versionId.trim();
    if (!trimmed) {
      setMessage('Selecione/importe uma tabela antes de publicar ou fazer rollback. versionId está vazio.');
      return;
    }

    setBusy(true);
    setMessage(action === 'publish' ? `Publicando versão ${trimmed}...` : `Executando rollback da versão ${trimmed}...`);
    try {
      const endpoint = action === 'publish'
        ? `/freight-tables/versions/${trimmed}/publish`
        : `/freight-tables/versions/${trimmed}/rollback`;
      const res = await api(endpoint, { method: 'POST', body: '{}' });
      setOut(res);
      setMessage(action === 'publish' ? `Versão ${trimmed} publicada com sucesso.` : `Rollback da versão ${trimmed} executado com sucesso.`);
    } catch (error: any) {
      setMessage(`Falha ao ${action === 'publish' ? 'publicar' : 'executar rollback'}: ${error?.message || 'erro inesperado'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Gestão de tabela de frete</h2>
      <div className="row">
        <input
          type="file"
          accept=".xlsx"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            await importWorkbook(file);
          }}
        />
        <input
          placeholder="versionId"
          value={versionId}
          disabled={busy}
          onChange={(e) => setVersionId(e.target.value)}
        />
        <button disabled={busy || !versionId.trim()} onClick={async () => runVersionAction('publish')}>Publicar</button>
        <button disabled={busy || !versionId.trim()} onClick={async () => runVersionAction('rollback')}>Rollback</button>
      </div>
      {message ? <p>{message}</p> : null}
      <JsonView data={out} />
    </div>
  );
}
