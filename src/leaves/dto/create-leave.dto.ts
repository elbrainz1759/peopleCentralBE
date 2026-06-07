import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

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

  @Transform(({ value }: { value: unknown }) => {
    try {
      return typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
    } catch {
      return value;
    }
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HandoverNoteDto)
  handoverNotes: HandoverNoteDto[] = [];

  @Transform(({ value }: { value: unknown }) => {
    try {
      return typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
    } catch {
      return value;
    }
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeaveDurationDto)
  leaveDuration: LeaveDurationDto[] = [];
}
