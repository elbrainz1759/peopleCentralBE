import { IsString, IsOptional } from 'class-validator';

export class UpdateCountryDto {
  @IsString()
  @IsOptional()
  name?: string;
}
