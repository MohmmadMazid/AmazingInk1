import { PostageTierCode, PostageTierConfig } from './pricing.types';

/**
 * Default postage tier table.
 * Rates are placeholders — replace with real values before go-live.
 * TIER_5_SPECIAL is intentionally `rate: null, active: false` per the voice-note
 * instruction to leave the 5th tier blank for now.
 */
export const DEFAULT_POSTAGE_TIERS: PostageTierConfig[] = [
  {
    code: PostageTierCode.TIER_1_STANDARD_SMALL,
    label: 'Standard Small',
    rate: 2.5,
    active: true,
  },
  {
    code: PostageTierCode.TIER_2_STANDARD_MEDIUM,
    label: 'Standard Medium',
    rate: 4.0,
    active: true,
  },
  {
    code: PostageTierCode.TIER_3_STANDARD_LARGE,
    label: 'Standard Large',
    rate: 6.5,
    active: true,
  },
  {
    code: PostageTierCode.TIER_4_STANDARD_OVERSIZED,
    label: 'Standard Oversized',
    rate: 12.0,
    active: true,
  },
  {
    code: PostageTierCode.TIER_5_SPECIAL,
    label: 'Special / Custom',
    rate: null, // left blank on purpose — not active yet
    active: false,
  },
];
