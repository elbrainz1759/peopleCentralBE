import { IsString } from 'class-validator';

export class RequestRefreshDto {
  @IsString()
  token: string;
}
