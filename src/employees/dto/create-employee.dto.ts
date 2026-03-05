import { Type } from 'class-transformer';
import { IsString, IsEmail, IsNotEmpty, IsInt } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  first_name: string;

  @IsString()
  @IsNotEmpty()
  last_name: string;

  @IsString()
  @IsNotEmpty()
  designation: string;

  @IsInt()
  @IsNotEmpty()
  @Type(() => Number)
  staffId: number;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsString()
  @IsNotEmpty()
  supervisor: string;

  @IsString()
  @IsNotEmpty()
  programId: string;

  @IsString()
  @IsNotEmpty()
  departmentId: string;

  @IsString()
  @IsNotEmpty()
  countryId: string;
}
