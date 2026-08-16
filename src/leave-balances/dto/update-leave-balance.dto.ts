import { IsNumber, Min } from 'class-validator';

export class UpdateLeaveBalanceDto {
  @IsNumber()
  @Min(0)
  totalHours: number;
}
