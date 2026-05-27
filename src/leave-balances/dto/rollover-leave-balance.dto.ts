import { IsInt, IsString, IsNotEmpty } from 'class-validator';

export class RolloverLeaveBalanceDto {
  @IsInt()
  annualLeaveTypeId: string = '';

  @IsString()
  @IsNotEmpty()
  createdBy: string = '';
}
