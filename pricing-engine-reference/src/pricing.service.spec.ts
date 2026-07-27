import { PricingService } from './pricing.service';
import { PostageTierCode } from './pricing.types';

describe('PricingService', () => {
  const service = new PricingService();

  it('calculates the Website Price using the documented formula', () => {
    // Cost 10, Tier 1 postage 2.5, Profit fixed 3, VAT 20%
    // subtotal = 10 + 2.5 + 3 = 15.5
    // vat = 15.5 * 0.20 = 3.1
    // total = 18.6
    const result = service.calculate({
      itemId: 'ITEM-1',
      supplierCost: 10,
      postageTier: PostageTierCode.TIER_1_STANDARD_SMALL,
      profitRule: { mode: 'FIXED', value: 3 },
      vatPercent: 20,
    });

    expect(result.postageCost).toBe(2.5);
    expect(result.subtotalBeforeVat).toBe(15.5);
    expect(result.vatAmount).toBe(3.1);
    expect(result.websitePrice).toBe(18.6);
  });

  it('supports percentage-based profit rules', () => {
    // Cost 20, Tier 2 postage 4, subtotal-before-profit = 24
    // profit 10% of 24 = 2.4, subtotal-before-vat = 26.4
    const result = service.calculate({
      itemId: 'ITEM-2',
      supplierCost: 20,
      postageTier: PostageTierCode.TIER_2_STANDARD_MEDIUM,
      profitRule: { mode: 'PERCENT', value: 10 },
      vatPercent: 0,
    });

    expect(result.profitAmount).toBe(2.4);
    expect(result.websitePrice).toBe(26.4);
  });

  it('rejects the optional Tier 5 until it has a configured rate', () => {
    expect(() =>
      service.calculate({
        itemId: 'ITEM-3',
        supplierCost: 10,
        postageTier: PostageTierCode.TIER_5_SPECIAL,
        profitRule: { mode: 'FIXED', value: 1 },
        vatPercent: 20,
      }),
    ).toThrow(/not active or has no rate/);
  });

  it('rejects unknown postage tiers instead of silently defaulting', () => {
    expect(() =>
      service.calculate({
        itemId: 'ITEM-4',
        supplierCost: 10,
        postageTier: 'NOT_A_REAL_TIER' as PostageTierCode,
        profitRule: { mode: 'FIXED', value: 1 },
        vatPercent: 20,
      }),
    ).toThrow(/Unknown postage tier/);
  });

  it('calculates a batch independently per item (no flat/shared pricing)', () => {
    const results = service.calculateBatch([
      {
        itemId: 'A',
        supplierCost: 5,
        postageTier: PostageTierCode.TIER_1_STANDARD_SMALL,
        profitRule: { mode: 'FIXED', value: 1 },
        vatPercent: 20,
      },
      {
        itemId: 'B',
        supplierCost: 50,
        postageTier: PostageTierCode.TIER_4_STANDARD_OVERSIZED,
        profitRule: { mode: 'FIXED', value: 5 },
        vatPercent: 20,
      },
    ]);

    expect(results[0].websitePrice).not.toBe(results[1].websitePrice);
    expect(results[0].postageCost).toBe(2.5);
    expect(results[1].postageCost).toBe(12.0);
  });
});
