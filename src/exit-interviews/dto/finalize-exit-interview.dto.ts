import { IsString, IsNotEmpty } from 'class-validator';

export class FinalizeExitInterviewDto {
  @IsString()
  @IsNotEmpty()
  finalizedBy: string;
}
