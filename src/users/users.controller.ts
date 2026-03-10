import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':unique_id')
  findOne(@Param('unique_id') unique_id: string) {
    return this.usersService.findOne(unique_id);
  }

  @Patch(':unique_id')
  update(
    @Param('unique_id') unique_id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(unique_id, updateUserDto);
  }

  @Delete(':unique_id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('unique_id') unique_id: string) {
    return this.usersService.remove(unique_id);
  }
}
