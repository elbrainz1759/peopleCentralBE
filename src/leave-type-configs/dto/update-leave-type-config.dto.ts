import {
  IsInt,
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class UpdateLeaveTypeConfigDto {
  @IsOptional()
  @IsInt()
  leaveTypeId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  country?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  annualHours?: number;

  // Pass null explicitly to convert an accrual-type to a fixed-entitlement type.
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyAccrualHours?: number | null;
}
