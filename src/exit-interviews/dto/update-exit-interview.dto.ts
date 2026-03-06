import { PartialType } from '@nestjs/mapped-types';
import { CreateExitInterviewDto } from './create-exit-interview.dto';

/** All fields from CreateExitInterviewDto, each optional (for PATCH updates). */
// eslint-disable-next-line @typescript-eslint/no-unsafe-call -- PartialType() is a valid Nest/mapped-types pattern
export class UpdateExitInterviewDto extends PartialType(
  CreateExitInterviewDto,
) {}
