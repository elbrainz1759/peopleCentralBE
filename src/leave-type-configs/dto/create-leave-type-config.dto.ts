import {
  IsInt,
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateLeaveTypeConfigDto {
  @IsInt()
  leaveTypeId: number = 0;

  @IsString()
  @IsNotEmpty()
  country: string = '';

  @IsNumber()
  @Min(0)
  annualHours: number = 0;

  // Null = not an accrual type. Omit entirely for fixed-entitlement leave types.
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyAccrualHours?: number | null;
}
