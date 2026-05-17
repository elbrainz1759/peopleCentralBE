import { Transform } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsEmail,
  IsInt,
  Min,
  ArrayMinSize,
  Matches,
} from 'class-validator';

export class CreateDataTrackerDto {
  @IsString()
  @IsNotEmpty()
  title: string = '';

  @IsOptional()
  @IsString()
  description?: string;

  /**
   * Accepts either "mm/dd/yyyy" (browser native) or "yyyy-mm-dd" (ISO).
   * Normalised to "yyyy-mm-dd" for MySQL.
   */
  @IsNotEmpty()
  @Transform(({ value }) => normaliseDate(value))
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'start_date must be a valid date (mm/dd/yyyy or yyyy-mm-dd)',
  })
  start_date: string = '';

  @IsNotEmpty()
  @Transform(({ value }) => normaliseDate(value))
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'end_date must be a valid date (mm/dd/yyyy or yyyy-mm-dd)',
  })
  end_date: string = '';

  /**
   * Accepts a comma-separated string ("hr@co.com, mgr@co.com")
   * OR an already-parsed string array.
   */
  @Transform(({ value }) => parseStringArray(value))
  @IsArray()
  @ArrayMinSize(1)
  @IsEmail({}, { each: true })
  recipients: string[] = [];

  /**
   * Accepts a comma-separated string ("30,15,7")
   * OR an already-parsed number array.
   */
  @Transform(({ value }) => parseNumberArray(value))
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  notification_periods: number[] = [];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts "mm/dd/yyyy" → "yyyy-mm-dd".
 * Passes through values that are already in ISO format.
 */
function normaliseDate(value: unknown): string {
  if (typeof value !== 'string') return value as string;

  const trimmed = value.trim();

  // Already ISO – nothing to do
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // Browser native: mm/dd/yyyy
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const [, mm, dd, yyyy] = match;
    return `${yyyy}-${mm}-${dd}`;
  }

  // Return as-is and let @Matches report the error
  return trimmed;
}

/**
 * Splits a comma-separated email string into a trimmed string[].
 * Passes through values that are already an array.
 */
function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim());
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Splits a comma-separated number string into a number[].
 * Passes through values that are already an array.
 */
function parseNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number);
  }
  return [];
}
