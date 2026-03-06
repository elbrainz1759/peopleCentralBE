import {
  IsString,
  IsInt,
  IsDateString,
  IsOptional,
  IsIn,
  Min,
  Max,
} from 'class-validator';

export class CreateExitInterviewDto {
  @IsInt()
  staffId: number;

  @IsInt()
  departmentId: number;

  @IsInt()
  supervisorId: number;

  @IsDateString()
  resignationDate: string;

  @IsString()
  reasonForLeaving: string;

  @IsOptional()
  @IsString()
  otherReason?: string;

  @IsOptional()
  @IsString()
  mostEnjoyed?: string;

  @IsOptional()
  @IsString()
  companyImprovement?: string;

  @IsOptional()
  @IsString()
  handoverNotes?: string;

  @IsOptional()
  @IsString()
  newEmployer?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  ratingCulture: number;

  @IsInt()
  @Min(1)
  @Max(5)
  ratingJob: number;

  @IsInt()
  @Min(1)
  @Max(5)
  ratingManager: number;

  @IsIn(['Yes', 'No', 'Maybe'])
  wouldRecommend: string;

  @IsOptional()
  @IsIn(['Employee', 'Supervisor', 'HR', 'Operations', 'Finance'])
  stage?: string;

  @IsOptional()
  @IsIn(['Pending', 'Approved', 'Rejected'])
  status?: string;
}
