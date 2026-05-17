import { PartialType } from '@nestjs/mapped-types';
import { CreateDataTrackerDto } from './create-data-tracker.dto';

/**
 * All fields are optional for PATCH updates.
 * Inherits every @Transform and @IsXxx validator from CreateDataTrackerDto,
 * so date normalisation and array parsing apply automatically when a field
 * is present in the request body.
 */
export class UpdateDataTrackerDto extends PartialType(CreateDataTrackerDto) {}
