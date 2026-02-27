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
  unique_id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  @IsNotEmpty()
  fund_code: number;

  @IsDateString()
  @IsNotEmpty()
  start_date: string;

  @IsDateString()
  @IsNotEmpty()
  end_date: string;

  @IsString()
  @IsNotEmpty()
  created_by: string;
}

export class UpdateProgramDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsInt()
  @IsOptional()
  fund_code?: number;

  @IsDateString()
  @IsOptional()
  start_date?: string;

  @IsDateString()
  @IsOptional()
  end_date?: string;
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
