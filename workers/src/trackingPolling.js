const statusMap = {
  posted: 'DISPATCHED',
  in_transit: 'IN_TRANSIT',
  out_for_delivery: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  exception: 'EXCEPTION'
};

export function normalizeTrackingStatus(externalStatus) {
  return statusMap[externalStatus] || 'IN_TRANSIT';
}
