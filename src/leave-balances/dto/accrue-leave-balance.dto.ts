import { IsInt, IsString, IsNotEmpty } from 'class-validator';

export class AccrueLeaveBalanceDto {
  @IsInt()
  leaveTypeId: string = '';

  @IsString()
  @IsNotEmpty()
  createdBy: string = '';
}
