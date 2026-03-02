import { IsInt, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreateLeaveBalanceDto {
  @IsString()
  @IsNotEmpty()
  unique_id: string;

  @IsInt()
  @IsNotEmpty()
  staff_id: number;

  @IsInt()
  @IsNotEmpty()
  leave_type_id: number;

  @IsNumber()
  @Min(0)
  total_hours: number;

  @IsString()
  @IsNotEmpty()
  created_by: string;
}
