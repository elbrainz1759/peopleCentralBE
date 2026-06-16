import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsDateString,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProgramDto {
  @IsString()
  @IsNotEmpty()
  name: string = '';

  @IsInt()
  @IsNotEmpty()
  fundCode: number = 0;

  @IsDateString()
  @IsNotEmpty()
  startDate: string = '';

  @IsDateString()
  @IsNotEmpty()
  endDate: string = '';

  @IsString()
  @IsNotEmpty()
  countryId: string = '';
}

export class UpdateProgramDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsInt()
  @IsOptional()
  fundCode?: number;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  countryId?: string;
}

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;
}
