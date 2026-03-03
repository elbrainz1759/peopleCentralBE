import { IsInt, IsNotEmpty, IsNumber, Min } from 'class-validator';

export class CreateLeaveBalanceDto {
  @IsInt()
  @IsNotEmpty()
  staffId: number;

  @IsInt()
  @IsNotEmpty()
  leaveTypeId: number;

  @IsNumber()
  @Min(0)
  totalHours: number;
}
