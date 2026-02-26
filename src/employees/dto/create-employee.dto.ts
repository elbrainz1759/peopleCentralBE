import { IsString, IsEmail, IsNotEmpty, IsInt } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  unique_id: string;

  @IsString()
  @IsNotEmpty()
  first_name: string;

  @IsString()
  @IsNotEmpty()
  last_name: string;

  @IsInt()
  @IsNotEmpty()
  staff_id: number;

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
  program: string;

  @IsString()
  @IsNotEmpty()
  created_by: string;
}
