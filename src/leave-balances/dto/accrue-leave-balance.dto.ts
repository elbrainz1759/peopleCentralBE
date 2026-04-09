import { IsInt, IsString, IsNotEmpty } from 'class-validator';

export class AccrueLeaveBalanceDto {
  @IsInt()
  leaveTypeId: number = 0;

  @IsString()
  @IsNotEmpty()
  createdBy: string = '';
}
