import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateLeaveDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;
}
