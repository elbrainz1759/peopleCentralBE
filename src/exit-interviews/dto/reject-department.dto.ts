import { IsIn, IsString, MinLength } from 'class-validator';

export class RejectDepartmentDto {
  @IsIn(['Supervisor', 'Operations', 'Finance', 'HR', 'HR_Director'])
  department: 'Supervisor' | 'Operations' | 'Finance' | 'HR' | 'HR_Director' =
    'Operations';

  // Required — a rejection with no explanation leaves HR and the employee
  // with nothing to act on.
  @IsString()
  @MinLength(1)
  reason: string = '';
}
