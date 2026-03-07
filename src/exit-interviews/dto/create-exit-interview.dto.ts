import {
  IsString,
  IsInt,
  IsDateString,
  IsOptional,
  IsIn,
  Min,
  Max,
  IsNotEmpty,
} from 'class-validator';

export class CreateExitInterviewDto {
  @IsInt()
  @IsNotEmpty()
  staffId: number;

  @IsString()
  @IsNotEmpty()
  departmentId: string;

  @IsString()
  @IsNotEmpty()
  supervisorId: string;

  @IsDateString()
  @IsNotEmpty()
  resignationDate: string;

  @IsString()
  @IsNotEmpty()
  reasonForLeaving: string;

  @IsNotEmpty()
  @IsString()
  otherReason?: string;

  @IsNotEmpty()
  @IsString()
  programId?: string;

  @IsNotEmpty()
  @IsString()
  countryId?: string;

  @IsNotEmpty()
  @IsString()
  locationId?: string;

  @IsNotEmpty()
  @IsString()
  mostEnjoyed?: string;

  @IsNotEmpty()
  @IsString()
  companyImprovement?: string;

  @IsNotEmpty()
  @IsString()
  handoverNotes?: string;

  @IsNotEmpty()
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
