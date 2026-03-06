import { PartialType } from '@nestjs/mapped-types';
import { CreateExitInterviewDto } from './create-exit-interview.dto';

export class UpdateExitInterviewDto extends PartialType(
  CreateExitInterviewDto,
) {}
