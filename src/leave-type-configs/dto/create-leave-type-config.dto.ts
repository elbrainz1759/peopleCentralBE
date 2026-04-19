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
  leaveTypeId: string = '';

  @IsString()
  @IsNotEmpty()
  country: string = '';

  @IsNumber()
  @Min(0)
  annualHours: number = 0;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyAccrualHours?: number | null;
}
