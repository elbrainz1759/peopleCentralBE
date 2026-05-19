import { IsEmail, IsString } from 'class-validator';

export class ApproveUserDto {
  @IsEmail()
  email: string = '';

  @IsString()
  role: string = 'User';

  @IsEmail()
  supervisorEmail: string = '';
}
