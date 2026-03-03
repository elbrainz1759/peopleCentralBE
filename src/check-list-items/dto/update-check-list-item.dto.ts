import { IsString, IsOptional } from 'class-validator';

export class UpdateCheckListItemDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  departmentId: string;
}
