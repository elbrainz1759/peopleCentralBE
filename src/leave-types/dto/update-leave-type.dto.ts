import { IsString, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateLeaveTypeDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsIn(['Yes', 'No'])
  requireDocument: 'Yes' | 'No' = 'No';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  trigger: number = 0;
}
