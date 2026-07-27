import {
  IsEnum,
  IsIn,
  IsNumber,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PostageTierCode, ProfitMode } from './pricing.types';

export class ProfitRuleDto {
  @IsIn(['FIXED', 'PERCENT'])
  mode: ProfitMode;

  @IsNumber()
  @Min(0)
  value: number;
}

export class PricingInputDto {
  @IsString()
  itemId: string;

  @IsNumber()
  @Min(0)
  supplierCost: number;

  @IsEnum(PostageTierCode)
  postageTier: PostageTierCode;

  @ValidateNested()
  @Type(() => ProfitRuleDto)
  profitRule: ProfitRuleDto;

  @IsNumber()
  @Min(0)
  vatPercent: number;
}

export class PricingBatchDto {
  @ValidateNested({ each: true })
  @Type(() => PricingInputDto)
  items: PricingInputDto[];
}
