import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class UpdateLocationDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  countryId: string;
}
