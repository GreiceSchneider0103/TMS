export function computeWeights({ weightKg, lengthCm, widthCm, heightCm, cubingFactor }) {
  const cubicWeight = (Number(lengthCm) * Number(widthCm) * Number(heightCm)) / Number(cubingFactor || 300);
  const billableWeight = Math.max(Number(weightKg), cubicWeight);
  return { cubicWeight, billableWeight };
}

export function calculateRouteQuote({ route, request, recipientFees = [], additional = {} }) {
  const { cubicWeight, billableWeight } = computeWeights({
    weightKg: request.weightKg,
    lengthCm: request.lengthCm,
    widthCm: request.widthCm,
    heightCm: request.heightCm,
    cubingFactor: route.cubing_factor
  });

  if (billableWeight < Number(route.min_weight) || billableWeight > Number(route.max_weight)) return null;
  if (!cepInRange(request.destinationPostalCode, route.cep_start, route.cep_end)) return null;
  if (route.state && request.state && route.state !== request.state) return null;
  if (route.city && request.city && route.city.toLowerCase() !== request.city.toLowerCase()) return null;

  const base = Number(route.base_amount);
  const excess = Math.max(0, billableWeight - Number(route.min_weight)) * Number(route.extra_per_kg || 0);
  const baseWithMin = Math.max(base + excess, Number(route.min_freight || 0));
  const adValorem = Number(request.invoiceAmount || 0) * (Number(route.ad_valorem_pct || 0) / 100);
  const gris = Number(request.invoiceAmount || 0) * (Number(route.gris_pct || 0) / 100);
  const trt = Number(route.trt_amount || 0);
  const tda = Number(route.tda_amount || 0);
  const recipientFee = recipientFees.reduce((acc, item) => acc + Number(item.amount || 0), 0);
  const toll = Number(additional.toll || 0);
  const extra = Number(additional.extra || 0);

  const total = baseWithMin + adValorem + gris + trt + tda + recipientFee + toll + extra;

  return {
    carrierId: route.carrier_id,
    routeId: route.id,
    totalAmount: round2(total),
    totalDays: Number(route.sla_days || 0),
    breakdown: {
      base: round2(base),
      excess: round2(excess),
      minApplied: round2(baseWithMin),
      adValorem: round2(adValorem),
      gris: round2(gris),
      trt: round2(trt),
      tda: round2(tda),
      recipientFee: round2(recipientFee),
      toll: round2(toll),
      extra: round2(extra),
      cubicWeight: round3(cubicWeight),
      billableWeight: round3(billableWeight)
    },
    justification: `Rota ${route.id} elegível para CEP/faixa de peso`
  };
}

function cepInRange(cep, start, end) {
  const value = Number(String(cep).replace(/\D/g, ''));
  return value >= Number(String(start).replace(/\D/g, '')) && value <= Number(String(end).replace(/\D/g, ''));
}

const round2 = (n) => Number(Number(n).toFixed(2));
const round3 = (n) => Number(Number(n).toFixed(3));
