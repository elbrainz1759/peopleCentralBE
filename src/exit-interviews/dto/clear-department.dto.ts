import { IsString, IsIn, IsArray, IsInt, IsOptional } from 'class-validator';

export class ClearDepartmentDto {
  @IsIn(['Operations', 'Finance', 'HR'])
  department: 'Operations' | 'Finance' | 'HR' | 'Pending' = 'Operations';

  @IsArray()
  @IsInt({ each: true })
  checkListItemIds: number[] = [];

  @IsString()
  clearedBy: string = '';

  @IsOptional()
  @IsString()
  notes?: string = '';
}
