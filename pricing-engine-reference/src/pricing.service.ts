import { Injectable, BadRequestException } from '@nestjs/common';
import { DEFAULT_POSTAGE_TIERS } from './postage-tiers.config';
import {
  PostageTierCode,
  PostageTierConfig,
  PricingBreakdown,
  PricingInput,
} from './pricing.types';

@Injectable()
export class PricingService {
  private readonly tiers: Map<PostageTierCode, PostageTierConfig>;

  constructor(tierConfig: PostageTierConfig[] = DEFAULT_POSTAGE_TIERS) {
    this.tiers = new Map(tierConfig.map((t) => [t.code, t]));
  }

  /**
   * Resolve the postage cost for a tier. Throws if the tier is unknown, inactive,
   * or has no rate set (e.g. the optional Tier 5 before it's configured).
   *
   * This is the enforcement point for the "no flat-rate postage" rule: callers
   * cannot pass an arbitrary number, only a tier code that must resolve through
   * config.
   */
  resolvePostage(tierCode: PostageTierCode): number {
    const tier = this.tiers.get(tierCode);
    if (!tier) {
      throw new BadRequestException(`Unknown postage tier: ${tierCode}`);
    }
    if (!tier.active || tier.rate === null) {
      throw new BadRequestException(
        `Postage tier "${tier.label}" is not active or has no rate configured yet.`,
      );
    }
    return tier.rate;
  }

  /**
   * Calculate profit amount given the subtotal it's based on (Cost + Postage).
   */
  private resolveProfit(input: PricingInput, subtotalBeforeProfit: number): number {
    const { mode, value } = input.profitRule;
    if (mode === 'FIXED') return value;
    if (mode === 'PERCENT') return +(subtotalBeforeProfit * (value / 100)).toFixed(2);
    throw new BadRequestException(`Unknown profit mode: ${mode}`);
  }

  /**
   * Calculate the full Website Price breakdown for a single item.
   *
   * Website Price = (Supplier Cost + Postage + Profit) × (1 + VAT%)
   */
  calculate(input: PricingInput): PricingBreakdown {
    if (input.supplierCost < 0) {
      throw new BadRequestException('supplierCost cannot be negative');
    }
    if (input.vatPercent < 0) {
      throw new BadRequestException('vatPercent cannot be negative');
    }

    const postageCost = this.resolvePostage(input.postageTier);
    const subtotalBeforeProfit = input.supplierCost + postageCost;
    const profitAmount = this.resolveProfit(input, subtotalBeforeProfit);

    const subtotalBeforeVat = +(subtotalBeforeProfit + profitAmount).toFixed(2);
    const vatAmount = +(subtotalBeforeVat * (input.vatPercent / 100)).toFixed(2);
    const websitePrice = +(subtotalBeforeVat + vatAmount).toFixed(2);

    return {
      itemId: input.itemId,
      supplierCost: input.supplierCost,
      postageTier: input.postageTier,
      postageCost,
      profitAmount,
      subtotalBeforeVat,
      vatPercent: input.vatPercent,
      vatAmount,
      websitePrice,
    };
  }

  /**
   * Bulk calculation for a CSV import batch. Each item resolves its own tier/cost —
   * nothing here applies a shared/flat price across the batch.
   */
  calculateBatch(inputs: PricingInput[]): PricingBreakdown[] {
    return inputs.map((input) => this.calculate(input));
  }
}
