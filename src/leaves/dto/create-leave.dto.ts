import {
  IsArray,
  IsEmail,
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
  leaveTypeId: string = '';
}

export class HandoverNoteDto {
  @IsEmail()
  staffEmail: string = '';

  @IsString()
  @IsNotEmpty()
  note: string = '';
}

export class CreateLeaveDto {
  @IsString()
  @IsNotEmpty()
  staffId: string = '';

  @IsString()
  @IsOptional()
  reason?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HandoverNoteDto)
  handoverNotes: HandoverNoteDto[] = [];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeaveDurationDto)
  leaveDuration: LeaveDurationDto[] = [];
}
