export function applyShippingRules(baseQuote, rules = []) {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  let total = baseQuote.subtotal;
  const applied = [];

  for (const rule of sorted) {
    if (!rule.active) continue;
    if (rule.action === 'discount_percent') {
      total -= total * (rule.value / 100);
      applied.push(rule.name);
    }
    if (rule.action === 'add_fixed') {
      total += rule.value;
      applied.push(rule.name);
    }
    if (rule.action === 'min_amount') {
      total = Math.max(total, rule.value);
      applied.push(rule.name);
    }
  }

  return {
    total: Number(total.toFixed(2)),
    appliedRules: applied
  };
}
