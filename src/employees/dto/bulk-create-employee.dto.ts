import { Type } from 'class-transformer';
import {
  IsArray,
  IsString,
  IsEmail,
  IsNotEmpty,
  IsInt,
  IsOptional,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';

export class BulkEmployeeRowDto {
  @IsString()
  @IsNotEmpty()
  firstName: string = '';

  @IsString()
  @IsNotEmpty()
  lastName: string = '';

  @IsString()
  @IsNotEmpty()
  designation: string = '';

  @IsInt()
  @IsNotEmpty()
  @Type(() => Number)
  staffId: number = 0;

  @IsEmail()
  @IsNotEmpty()
  email: string = '';

  @IsString()
  @IsNotEmpty()
  locationId: string = '';

  @IsString()
  @IsNotEmpty()
  programId: string = '';

  @IsString()
  @IsNotEmpty()
  departmentId: string = '';

  @IsString()
  @IsNotEmpty()
  countryId: string = '';

  // The supervisor's staffId (e.g. their "Employee Number" from an HR
  // export) — NOT a unique_id. Resolved server-side against every row in
  // this same batch plus existing employees, since the supervisor may be
  // created in this very batch. Left unresolved (and reported back) if no
  // match is found anywhere.
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  supervisorStaffId?: number;
}

export class BulkCreateEmployeeDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkEmployeeRowDto)
  employees: BulkEmployeeRowDto[] = [];
}
