import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { DEFAULT_POSTAGE_TIERS } from './postage-tiers.config';

/**
 * Drop-in module for the existing NestJS backend (mccms).
 * Import into AppModule, or into the Catalog module if CSV import lives there.
 *
 * Once postage tiers move to the database (recommended for admin editing),
 * replace DEFAULT_POSTAGE_TIERS with a repository lookup and provide it
 * via a factory provider instead.
 */
@Module({
  controllers: [PricingController],
  providers: [
    {
      provide: PricingService,
      useFactory: () => new PricingService(DEFAULT_POSTAGE_TIERS),
    },
  ],
  exports: [PricingService],
})
export class PricingModule {}
