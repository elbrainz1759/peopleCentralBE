import { IsInt, IsString, IsNotEmpty } from 'class-validator';

export class RolloverLeaveBalanceDto {
  @IsInt()
  annualLeaveTypeId: number = 0;

  @IsString()
  @IsNotEmpty()
  createdBy: string = '';
}
