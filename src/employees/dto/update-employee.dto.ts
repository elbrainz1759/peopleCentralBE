import {
  IsString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsInt()
  staffId?: number;

  @IsOptional()
  @IsNotEmpty()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  supervisorId?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  programId?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  countryId?: string;
}
