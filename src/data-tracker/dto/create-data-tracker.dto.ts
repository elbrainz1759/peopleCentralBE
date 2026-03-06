import {
  IsString,
  IsDateString,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateDataTrackerDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;

  @IsArray()
  @IsEmail({}, { each: true })
  recipients: string[];

  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  notification_periods: number[];
}
