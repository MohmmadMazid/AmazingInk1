/**
 * Core types for the Dynamic Pricing Engine.
 * See PRICING_SPEC.md for the business-rule rationale behind each field.
 */

export enum PostageTierCode {
  TIER_1_STANDARD_SMALL = 'TIER_1_STANDARD_SMALL',
  TIER_2_STANDARD_MEDIUM = 'TIER_2_STANDARD_MEDIUM',
  TIER_3_STANDARD_LARGE = 'TIER_3_STANDARD_LARGE',
  TIER_4_STANDARD_OVERSIZED = 'TIER_4_STANDARD_OVERSIZED',
  TIER_5_SPECIAL = 'TIER_5_SPECIAL', // optional, may be unset / rate = null
}

export interface PostageTierConfig {
  code: PostageTierCode;
  label: string;
  /** Flat postage cost this tier resolves to. Null only permitted for TIER_5_SPECIAL. */
  rate: number | null;
  active: boolean;
}

export type ProfitMode = 'FIXED' | 'PERCENT';

export interface ProfitRule {
  mode: ProfitMode;
  /** Absolute £ amount if mode === 'FIXED', or a percentage (e.g. 20 = 20%) if mode === 'PERCENT'. */
  value: number;
}

/**
 * A single item's raw pricing inputs — typically one row from the supplier CSV
 * plus a resolved postage tier and an applicable profit rule.
 */
export interface PricingInput {
  itemId: string;
  supplierCost: number;
  postageTier: PostageTierCode;
  profitRule: ProfitRule;
  vatPercent: number;
}

/**
 * Full breakdown of how a Website Price was derived — kept for auditability
 * per PRICING_SPEC.md §5 rule 5.
 */
export interface PricingBreakdown {
  itemId: string;
  supplierCost: number;
  postageTier: PostageTierCode;
  postageCost: number;
  profitAmount: number;
  subtotalBeforeVat: number;
  vatPercent: number;
  vatAmount: number;
  websitePrice: number;
}
