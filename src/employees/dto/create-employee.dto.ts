import { Type } from 'class-transformer';
import { IsString, IsEmail, IsNotEmpty, IsInt } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

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
  locationId: string;

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
