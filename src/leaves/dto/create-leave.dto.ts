import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LeaveDurationDto {
  @IsString()
  @IsNotEmpty()
  startDate: string = '';

  @IsString()
  @IsNotEmpty()
  endDate: string = '';

  @IsString()
  @IsNotEmpty()
  leaveTypeId: string = ''; // unique_id of the leave type for this range
}

export class CreateLeaveDto {
  @IsInt()
  staffId: number = 0;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsNotEmpty()
  handoverNote: string = '';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeaveDurationDto)
  leaveDuration: LeaveDurationDto[] = [];
}
