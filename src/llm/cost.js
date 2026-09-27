import * as modelPricingRepo from '../repositories/model-pricing.repo.js';
import { logger } from '../core/logger.js';

export async function calculateCost({ provider, model, inputTokens = 0, outputTokens = 0 }) {
  try {
    const pricing = await modelPricingRepo.findLatestPricing(provider, model);

    if (!pricing) {
      logger.warn(
        { provider, model },
        'No pricing model found for provider and model; defaulting cost to 0',
      );
      return 0.0;
    }

    const inputPrice = parseFloat(pricing.input_price_per_1k);
    const outputPrice = parseFloat(pricing.output_price_per_1k);

    const inputCost = (inputTokens / 1000) * inputPrice;
    const outputCost = (outputTokens / 1000) * outputPrice;
    const totalCost = inputCost + outputCost;

    return Number(totalCost.toFixed(6));
  } catch (err) {
    logger.warn({ err, provider, model }, 'Error calculating cost; defaulting cost to 0');
    return 0.0;
  }
}
