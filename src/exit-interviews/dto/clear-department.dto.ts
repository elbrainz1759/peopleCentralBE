import { IsString, IsIn, IsArray, IsInt, IsOptional } from 'class-validator';

export class ClearDepartmentDto {
  @IsIn(['Supervisor', 'Operations', 'Finance', 'HR', 'HR_Director'])
  department: 'Supervisor' | 'Operations' | 'Finance' | 'HR' | 'HR_Director' =
    'Operations';

  @IsArray()
  @IsInt({ each: true })
  checkListItemIds: number[] = [];

  @IsString()
  clearedBy: string = '';

  @IsOptional()
  @IsString()
  notes?: string = '';

  // Only meaningful when department === 'Supervisor' — captured by the
  // employee's supervisor at their clearance step. Confidential: redacted
  // from any response that isn't going to HR/Superadmin.
  @IsOptional()
  @IsIn(['Yes', 'No'])
  rehireEligible?: 'Yes' | 'No';

  @IsOptional()
  @IsString()
  rehireIneligibleReason?: string;
}
