export function applyShippingRules(options, rules, ctx) {
  const active = rules
    .filter((r) => r.active)
    .filter((r) => inValidity(r, ctx.date || new Date().toISOString().slice(0, 10)))
    .sort((a, b) => a.priority - b.priority);

  return options
    .map((option) => {
      let blocked = false;
      let amount = Number(option.totalAmount);
      let days = Number(option.totalDays);
      const appliedRules = [];

      for (const rule of active) {
        if (!matches(rule, ctx, option)) continue;
        const action = rule.actions || {};

        if (action.block_carrier && String(action.block_carrier) === String(option.carrierId)) {
          blocked = true;
          appliedRules.push(`${rule.name}:block_carrier`);
        }
        if (action.discount_percent) {
          amount -= amount * (Number(action.discount_percent) / 100);
          appliedRules.push(`${rule.name}:discount_percent`);
        }
        if (action.discount_fixed) {
          amount -= Number(action.discount_fixed);
          appliedRules.push(`${rule.name}:discount_fixed`);
        }
        if (action.additional_percent) {
          amount += amount * (Number(action.additional_percent) / 100);
          appliedRules.push(`${rule.name}:additional_percent`);
        }
        if (action.additional_fixed) {
          amount += Number(action.additional_fixed);
          appliedRules.push(`${rule.name}:additional_fixed`);
        }
        if (action.min_amount) {
          amount = Math.max(amount, Number(action.min_amount));
          appliedRules.push(`${rule.name}:min_amount`);
        }
        if (action.max_amount) {
          amount = Math.min(amount, Number(action.max_amount));
          appliedRules.push(`${rule.name}:max_amount`);
        }
        if (action.add_days) {
          days += Number(action.add_days);
          appliedRules.push(`${rule.name}:add_days`);
        }
        if (action.prioritize_carrier && String(action.prioritize_carrier) === String(option.carrierId)) {
          option.priorityBoost = -10;
          appliedRules.push(`${rule.name}:prioritize_carrier`);
        }
      }

      return { ...option, totalAmount: round2(amount), totalDays: days, blocked, appliedRules };
    })
    .filter((x) => !x.blocked)
    .sort((a, b) => (a.priorityBoost || 0) - (b.priorityBoost || 0) || a.totalAmount - b.totalAmount || a.totalDays - b.totalDays)
    .map((x, i) => ({ ...x, ranking: i + 1 }));
}

function inValidity(rule, date) {
  if (rule.valid_from && date < rule.valid_from) return false;
  if (rule.valid_to && date > rule.valid_to) return false;
  return true;
}

function matches(rule, ctx, option) {
  const c = rule.conditions || {};
  if (c.channel && c.channel !== ctx.channel) return false;
  if (c.carrier_id && String(c.carrier_id) !== String(option.carrierId)) return false;
  if (c.state && c.state !== ctx.state) return false;
  if (c.city && c.city.toLowerCase() !== String(ctx.city || '').toLowerCase()) return false;
  if (c.recipient_type && c.recipient_type !== ctx.recipientType) return false;
  if (c.cep_start && c.cep_end) {
    const cep = Number(String(ctx.destinationPostalCode).replace(/\D/g, ''));
    if (cep < Number(c.cep_start) || cep > Number(c.cep_end)) return false;
  }
  if (c.min_weight && Number(ctx.billableWeight || 0) < Number(c.min_weight)) return false;
  if (c.max_weight && Number(ctx.billableWeight || 0) > Number(c.max_weight)) return false;
  if (c.min_invoice_amount && Number(ctx.invoiceAmount || 0) < Number(c.min_invoice_amount)) return false;
  if (c.max_invoice_amount && Number(ctx.invoiceAmount || 0) > Number(c.max_invoice_amount)) return false;
  if (c.sku && !ctx.skus?.includes(c.sku)) return false;
  if (c.category && !ctx.categories?.includes(c.category)) return false;
  return true;
}

const round2 = (n) => Number(Number(n).toFixed(2));
