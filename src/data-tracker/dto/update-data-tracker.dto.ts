import { PartialType } from '@nestjs/mapped-types';
import { CreateDataTrackerDto } from './create-data-tracker.dto';

export class UpdateDataTrackerDto extends PartialType(CreateDataTrackerDto) {}
