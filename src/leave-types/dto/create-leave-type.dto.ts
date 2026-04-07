import { IsString, IsNotEmpty } from 'class-validator';

export class CreateLeaveTypeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  country: string;

  // Add hours field to specify the number of hours for this leave type
  @IsNotEmpty()
  hours: number;
}
