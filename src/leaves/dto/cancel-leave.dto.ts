import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelLeaveDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
