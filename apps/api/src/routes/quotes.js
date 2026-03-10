import { calculateQuote } from '../services/freightEngine.js';
import { applyShippingRules } from '../services/rulesEngine.js';

export function registerQuoteRoutes(app) {
  app.post('/quotes/simulate', async ({ body }) => {
    const base = calculateQuote(body);
    const withRules = applyShippingRules(base, body.rules || []);

    return {
      input: body,
      quote: {
        ...base,
        total: withRules.total,
        appliedRules: withRules.appliedRules,
        ranking: 1
      }
    };
  });
}
