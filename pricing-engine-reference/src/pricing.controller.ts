import { Body, Controller, Post } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PricingBatchDto, PricingInputDto } from './pricing.dto';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  /**
   * Calculate the Website Price for a single item.
   * Typically called when a listing rule / dimensions change and one item
   * needs a live re-price.
   */
  @Post('calculate')
  calculate(@Body() dto: PricingInputDto) {
    return this.pricingService.calculate(dto);
  }

  /**
   * Calculate Website Prices for a batch of items — e.g. right after a
   * supplier CSV import, before the items are written to the catalog.
   */
  @Post('calculate-batch')
  calculateBatch(@Body() dto: PricingBatchDto) {
    return this.pricingService.calculateBatch(dto.items);
  }
}
