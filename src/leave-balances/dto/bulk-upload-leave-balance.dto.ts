import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateLeaveBalanceDto } from './create-leave-balance.dto';

export class BulkUploadLeaveBalanceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLeaveBalanceDto)
  balances: CreateLeaveBalanceDto[];
}
