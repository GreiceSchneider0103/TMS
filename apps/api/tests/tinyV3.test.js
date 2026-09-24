import assert from 'node:assert/strict';
import { mapTinyOrder, mapTinyProduct, channelFromTiny, tinyDate, extractInvoiceXml } from '../src/services/tiny/tinyMapper.js';
import { TinyV3Client, buildAuthUrl, requestToken } from '../src/services/tiny/tinyV3Client.js';

const ORDER = {
  id: 987654,
  numeroPedido: 1520,
  idNotaFiscal: 5555,
  situacao: 3,
  dataCriacao: '2026-09-20 14:30:00',
  dataPrevista: '2026-09-27',
  valorTotalProdutos: '189.90',
  valorTotalPedido: 214.8,
  valorFrete: '24.90',
  cliente: { nome: 'Maria Silva', cpfCnpj: '123.456.789-09', endereco: { cep: '01000-000', uf: 'SP', municipio: 'São Paulo' } },
  enderecoEntrega: { cep: '88010-000', uf: 'sc', municipio: 'Florianópolis' },
  ecommerce: { id: 1, nome: 'Shopee', numeroPedidoEcommerce: '240920ABCDEF' },
  transportador: { nome: 'Shopee Xpress', formaEnvio: { nome: 'Padrão' }, codigoRastreamento: 'BR123' },
  itens: [
    { produto: { id: 11, sku: 'SKU-A', descricao: 'Luminária' }, quantidade: 2, valorUnitario: 50 },
    { produto: { id: 12, sku: 'SKU-B', descricao: 'Abajur' }, quantidade: 1, valorUnitario: 89.9 }
  ]
};

export async function runTinyV3Tests() {
  // Pedido Shopee vindo do Tiny: mesma chave da integração direta com a Shopee (sem duplicar).
  const measures = new Map([['SKU-A', { weightKg: 0.8, lengthCm: 30, widthCm: 20, heightCm: 10 }], ['SKU-B', { weightKg: 1.5, lengthCm: 40, widthCm: 25, heightCm: 15 }]]);
  const m = mapTinyOrder(ORDER, { productMeasures: measures });
  assert.equal(m.externalId, 'shopee-240920ABCDEF');
  assert.equal(m.orderNumber, '240920ABCDEF');
  assert.equal(m.channel, 'shopee');
  assert.equal(m.status, 'READY_FOR_QUOTE');
  assert.equal(m.shippingAmount, 24.9);
  assert.equal(m.totalAmount, 214.8);
  assert.equal(m.invoiceAmount, 189.9);
  assert.equal(m.invoiceId, '5555');
  assert.equal(m.marketplaceCarrier, 'Shopee Xpress');
  assert.equal(m.marketplaceService, 'Padrão');
  assert.equal(m.promisedDeliveryDate, '2026-09-27');
  assert.equal(m.soldAt, '2026-09-20T17:30:00.000Z');
  assert.equal(m.rawPayload.postal_code, '88010000'); // endereço de entrega tem prioridade
  assert.equal(m.rawPayload.state, 'SC');
  assert.equal(m.rawPayload.weight_kg, 3.1); // 0.8*2 + 1.5
  assert.equal(m.rawPayload.length_cm, 40);
  assert.equal(m.rawPayload.height_cm, 35); // 10*2 + 15
  assert.equal(m.rawPayload.measures_source, 'produtos');
  assert.deepEqual(m.rawPayload.skus, ['SKU-A', 'SKU-B']);
  assert.equal(m.rawPayload.tiny_order_id, '987654');

  // Pedido de loja própria sem medidas cadastradas: usa peso padrão e chave tiny-<id>.
  const own = mapTinyOrder({ ...ORDER, ecommerce: null, enderecoEntrega: null, situacao: { codigo: 2 }, pesoBruto: '2,5' });
  assert.equal(own.externalId, 'tiny-987654');
  assert.equal(own.orderNumber, '1520');
  assert.equal(own.channel, 'tiny');
  assert.equal(own.status, 'CANCELED');
  assert.equal(own.rawPayload.postal_code, '01000000');
  assert.equal(own.rawPayload.weight_kg, 2.5);
  assert.equal(own.rawPayload.measures_source, 'pedido_tiny');

  assert.equal(channelFromTiny({ ecommerce: { nome: 'Mercado Livre' } }), 'mercadolivre');
  assert.equal(channelFromTiny({ ecommerce: { nome: 'Magazine Luiza' } }), 'magalu');
  assert.equal(tinyDate('20/09/2026', { dateOnly: true }), '2026-09-20');
  assert.equal(tinyDate('0000-00-00'), null);

  const p = mapTinyProduct({ id: 11, sku: 'SKU-A', descricao: 'Luminária', situacao: 'A', dimensoes: { pesoBruto: 0.8, comprimento: 30, largura: 20, altura: 10 } });
  assert.deepEqual([p.sku, p.weightKg, p.lengthCm, p.widthCm, p.heightCm, p.active], ['SKU-A', 0.8, 30, 20, 10, true]);
  assert.equal(extractInvoiceXml({ xmlNfe: '<nfeProc/>' }), '<nfeProc/>');
  assert.equal(extractInvoiceXml({ mensagem: 'erro' }), null);

  const authUrl = new URL(buildAuthUrl({ clientId: 'abc', redirectUri: 'https://api/cb', state: 'xyz' }));
  assert.equal(authUrl.searchParams.get('response_type'), 'code');
  assert.equal(authUrl.searchParams.get('state'), 'xyz');

  // Troca do código por token.
  const tokenFetch = async (url, init) => {
    assert.match(String(url), /\/token$/);
    assert.match(init.body, /grant_type=authorization_code/);
    return new Response(JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_in: 14400 }), { status: 200 });
  };
  const tokens = await requestToken({ clientId: 'a', clientSecret: 'b', code: 'c', redirectUri: 'r' }, tokenFetch);
  assert.equal(tokens.accessToken, 'AT');
  assert.equal(tokens.refreshToken, 'RT');

  // Cliente: renova o token no 401, espera no 429 e pagina a listagem.
  const calls = [];
  let refreshed = 0;
  const responses = [
    new Response('{"mensagem":"token expirado"}', { status: 401 }),
    new Response('{}', { status: 429, headers: { 'retry-after': '0' } }),
    new Response(JSON.stringify({ itens: [{ id: 1 }, { id: 2 }], paginacao: { total: 3 } }), { status: 200 }),
    new Response(JSON.stringify({ itens: [{ id: 3 }], paginacao: { total: 3 } }), { status: 200 })
  ];
  const client = new TinyV3Client({
    getToken: async ({ forceRefresh } = {}) => { if (forceRefresh) refreshed += 1; return forceRefresh ? 'NEW' : 'OLD'; },
    fetchImpl: async (url, init) => { calls.push({ url: String(url), auth: init.headers.Authorization }); return responses.shift(); },
    sleep: async () => {}
  });
  const all = await client.listAll(client.listOrders, { situacao: 3 }, { pageSize: 2 });
  assert.deepEqual(all.map((i) => i.id), [1, 2, 3]);
  assert.equal(refreshed, 1);
  assert.equal(calls[1].auth, 'Bearer NEW');
  assert.match(calls[3].url, /offset=2/);

  const failing = new TinyV3Client({ getToken: async () => 'T', fetchImpl: async () => new Response('{"mensagem":"Pedido não encontrado"}', { status: 404 }), sleep: async () => {} });
  await assert.rejects(() => failing.getOrder(1), (e) => e.status === 404 && /não encontrado/.test(e.message));
}
