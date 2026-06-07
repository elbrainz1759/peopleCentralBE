import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLeaveTypeDto {
  @IsString()
  @IsNotEmpty()
  name: string = '';

  @IsString()
  @IsNotEmpty()
  description: string = '';

  @IsString()
  @IsNotEmpty()
  country: string = '';

  @IsIn(['Yes', 'No'])
  requireDocument: 'Yes' | 'No' = 'No';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  trigger: number = 0;
}
