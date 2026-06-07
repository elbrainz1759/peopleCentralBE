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
  @IsNotEmpty()
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
      const parsed: unknown =
        typeof value === 'string' ? JSON.parse(value) : value;
      if (!Array.isArray(parsed)) return [];
      return (parsed as Record<string, unknown>[]).map((item) =>
        Object.assign(new HandoverNoteDto(), item),
      );
    } catch {
      return [];
    }
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HandoverNoteDto)
  handoverNotes: HandoverNoteDto[] = [];

  @Transform(({ value }: { value: unknown }) => {
    try {
      const parsed: unknown =
        typeof value === 'string' ? JSON.parse(value) : value;
      if (!Array.isArray(parsed)) return [];
      return (parsed as Record<string, unknown>[]).map((item) =>
        Object.assign(new LeaveDurationDto(), item),
      );
    } catch {
      return [];
    }
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeaveDurationDto)
  leaveDuration: LeaveDurationDto[] = [];
}
