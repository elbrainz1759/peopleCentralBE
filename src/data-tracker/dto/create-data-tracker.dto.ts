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
  title: string = '';

  @IsOptional()
  @IsString()
  description?: string = '';

  @IsDateString()
  start_date: Date = new Date();

  @IsDateString()
  end_date: Date = new Date();

  @IsArray()
  @IsEmail({}, { each: true })
  recipients: string[] = [];

  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  notification_periods: number[] = [];
}
