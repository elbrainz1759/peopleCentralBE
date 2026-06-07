import {
  IsString,
  IsInt,
  IsDateString,
  IsOptional,
  IsIn,
  IsNotEmpty,
} from 'class-validator';

export class CreateExitInterviewDto {
  @IsInt()
  @IsNotEmpty()
  staffId: number = 0;

  @IsString()
  @IsNotEmpty()
  departmentId: string = '';

  @IsString()
  @IsNotEmpty()
  supervisorId: string = '';

  @IsDateString()
  @IsNotEmpty()
  resignationDate: string = '';

  @IsString()
  @IsNotEmpty()
  reasonForLeaving: string = '';

  @IsOptional()
  @IsString()
  otherReason?: string;

  @IsString()
  @IsNotEmpty()
  programId: string = '';

  @IsString()
  @IsNotEmpty()
  countryId: string = '';

  @IsString()
  @IsNotEmpty()
  locationId: string = '';

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

  @IsOptional()
  @IsString()
  whyLeaving?: string;

  @IsOptional()
  @IsString()
  whatWouldPrevent?: string;

  @IsOptional()
  @IsString()
  suggestions?: string;

  @IsOptional()
  @IsIn(['Yes', 'No', 'Maybe', ''])
  workAsExpected?: string;

  @IsOptional()
  @IsString()
  workExpectedComments?: string;

  @IsOptional()
  @IsIn(['Too much', 'About right', 'Too little', ''])
  workload?: string;

  // Supervisor ratings
  @IsOptional()
  @IsString()
  supervisorFair?: string;

  @IsOptional()
  @IsString()
  supervisorCommunication?: string;

  @IsOptional()
  @IsString()
  supervisorFeedback?: string;

  @IsOptional()
  @IsString()
  supervisorRecognition?: string;

  @IsOptional()
  @IsString()
  supervisorSensitive?: string;

  @IsOptional()
  @IsString()
  supervisorPolicies?: string;

  @IsOptional()
  @IsString()
  supervisorComplaints?: string;

  // Job ratings
  @IsOptional()
  @IsString()
  ratingPay?: string;

  @IsOptional()
  @IsString()
  ratingTraining?: string;

  @IsOptional()
  @IsString()
  ratingCareerDev?: string;

  @IsOptional()
  @IsString()
  ratingEquipment?: string;

  @IsOptional()
  @IsString()
  ratingWorkConditions?: string;

  @IsOptional()
  @IsString()
  ratingOrientation?: string;

  @IsOptional()
  @IsString()
  ratingPerfReview?: string;

  @IsOptional()
  @IsString()
  ratingCoopDept?: string;

  @IsOptional()
  @IsString()
  ratingCoopOther?: string;

  @IsOptional()
  @IsString()
  ratingComments?: string;

  // Benefits
  @IsOptional()
  @IsString()
  benefitMedical?: string;

  @IsOptional()
  @IsString()
  benefitAnnualLeave?: string;

  @IsOptional()
  @IsString()
  benefitSickLeave?: string;

  @IsOptional()
  @IsString()
  benefitGratuity?: string;

  @IsOptional()
  @IsString()
  benefitHolidays?: string;

  @IsOptional()
  @IsString()
  benefitEducation?: string;

  @IsOptional()
  @IsIn(['Yes', 'No', 'Maybe', ''])
  wouldRecommend?: string;

  @IsOptional()
  @IsIn(['Employee', 'Supervisor', 'HR', 'Operations', 'Finance', ''])
  stage?: string;

  @IsOptional()
  @IsIn(['Pending', 'Approved', 'Rejected', ''])
  status?: string;
}
