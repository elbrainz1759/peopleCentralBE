import { IsString, IsNotEmpty } from 'class-validator';

export class CreateCountryDto {
  @IsString()
  @IsNotEmpty()
  unique_id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  created_by: string;
}
