import { IsString, IsIn, IsArray, IsInt, IsOptional } from 'class-validator';

export class ClearDepartmentDto {
  @IsIn(['Supervisor', 'Operations', 'Finance', 'HR', 'HR_Director'])
  department:
    | 'Supervisor'
    | 'Operations'
    | 'Finance'
    | 'HR'
    | 'HR_Director' = 'Operations';

  @IsArray()
  @IsInt({ each: true })
  checkListItemIds: number[] = [];

  @IsString()
  clearedBy: string = '';

  @IsOptional()
  @IsString()
  notes?: string = '';
}
