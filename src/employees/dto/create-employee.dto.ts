import { Type } from 'class-transformer';
import { IsString, IsEmail, IsNotEmpty, IsInt } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  firstName: string = '';

  @IsString()
  @IsNotEmpty()
  lastName: string = '';

  @IsString()
  @IsNotEmpty()
  designation: string = '';

  @IsString()
  @IsNotEmpty()
  status: string = '';

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
}
