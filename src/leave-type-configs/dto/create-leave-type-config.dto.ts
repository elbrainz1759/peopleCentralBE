import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateLeaveTypeConfigDto {
  @IsString()
  leaveTypeId!: string;

  @IsString()
  @IsNotEmpty()
  countryId!: string;

  @IsNumber()
  @Min(0)
  annualHours!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyAccrualHours?: number | null;

  @IsString()
  @IsNotEmpty()
  period!: 'Monthly' | 'Annually';
}
