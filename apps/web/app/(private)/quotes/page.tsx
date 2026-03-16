'use client';
import { useState } from 'react';
import { api } from '@/services/api';
import { JsonView } from '@/components/JsonView';

export default function QuotesPage() {
  const [orderId, setOrderId] = useState('');
  const [out, setOut] = useState<any>(null);
  const [quoteId, setQuoteId] = useState('');

  return (
    <div className="card">
      <h1>Cotação de frete</h1>
      <div className="row">
        <input placeholder="Order ID" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
        <button onClick={async () => setOut(await api(`/quotes/automatic/${orderId}`, { method: 'POST', body: '{}' }))}>Buscar quotes</button>
      </div>
      <div className="row">
        <input placeholder="Quote result ID" value={quoteId} onChange={(e) => setQuoteId(e.target.value)} />
        <button onClick={async () => setOut(await api(`/quotes/results/${quoteId}/select`, { method: 'PATCH', body: '{}' }))}>Escolher quote</button>
      </div>
      <JsonView data={out} />
    </div>
  );
}
