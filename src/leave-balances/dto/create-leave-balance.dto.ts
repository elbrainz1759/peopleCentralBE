import { IsInt, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreateLeaveBalanceDto {
  @IsInt()
  @IsNotEmpty()
  staffId: number;

  @IsString()
  @IsNotEmpty()
  leaveTypeId: string;

  @IsNumber()
  @Min(0)
  totalHours: number;
}
