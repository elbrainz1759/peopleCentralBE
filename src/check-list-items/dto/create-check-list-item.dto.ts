import { IsString, IsNotEmpty } from 'class-validator';

export class CreateCheckListItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  departmentId: string;
}
