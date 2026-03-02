import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsArray,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LeaveDurationDto {
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @IsDateString()
  @IsNotEmpty()
  endDate: string;
}

export class CreateLeaveDto {
  @IsInt()
  @IsNotEmpty()
  staffId: number;

  @IsInt()
  @IsNotEmpty()
  leaveTypeId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeaveDurationDto)
  leaveDuration: LeaveDurationDto[];

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsNotEmpty()
  handoverNote: string;
}
