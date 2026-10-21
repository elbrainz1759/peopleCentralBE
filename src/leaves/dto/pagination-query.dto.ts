import { IsOptional, IsInt, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  staffId?: number;

  // 'supervisor' forces ownership scoping (only the caller's own direct
  // reports) even for roles that would otherwise see every leave company-
  // wide — used by the dedicated "Pending Approvals" queue, which is a
  // strict "am I this employee's supervisor" question regardless of role.
  @IsOptional()
  @IsString()
  scope?: string;
}
