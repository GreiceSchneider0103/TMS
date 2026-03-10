export async function buildTinyStatusPayload(shipment) {
  return {
    pedido_id: shipment.externalOrderId,
    codigo_rastreio: shipment.trackingCode,
    transportadora: shipment.carrierName,
    status: shipment.status,
    entregue_em: shipment.deliveredAt || null
  };
}
