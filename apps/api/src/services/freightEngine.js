export function calculateQuote(input) {
  const cubicWeight = (input.lengthCm * input.widthCm * input.heightCm) / input.cubingFactor;
  const billableWeight = Math.max(input.weightKg, cubicWeight);
  const base = input.baseAmount + Math.max(0, billableWeight - input.minWeight) * input.extraPerKg;
  const adValorem = input.invoiceAmount * (input.adValoremPct / 100);
  const gris = input.invoiceAmount * (input.grisPct / 100);
  const subtotal = Math.max(base, input.minFreight) + adValorem + gris + input.trtAmount + input.tdaAmount;

  return {
    cubicWeight: Number(cubicWeight.toFixed(3)),
    billableWeight: Number(billableWeight.toFixed(3)),
    subtotal: Number(subtotal.toFixed(2)),
    breakdown: {
      base: Number(base.toFixed(2)),
      adValorem: Number(adValorem.toFixed(2)),
      gris: Number(gris.toFixed(2)),
      trt: input.trtAmount,
      tda: input.tdaAmount
    }
  };
}
