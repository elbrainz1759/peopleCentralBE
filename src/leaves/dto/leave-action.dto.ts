import { IsOptional, IsString, MaxLength } from 'class-validator';

export class LeaveActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comments?: string;
}
