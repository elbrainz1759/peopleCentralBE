import { IsInt, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class MonthlyAccrualDto {
  @IsInt()
  @IsNotEmpty()
  leave_type_id: number;

  @IsNumber()
  @Min(0)
  hours_to_accrue: number;

  @IsString()
  @IsNotEmpty()
  created_by: string;
}
