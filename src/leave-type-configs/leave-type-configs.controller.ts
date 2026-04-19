import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LeaveTypeConfigsService } from './leave-type-configs.service';
import { CreateLeaveTypeConfigDto } from './dto/create-leave-type-config.dto';
import { UpdateLeaveTypeConfigDto } from './dto/update-leave-type-config.dto';

@Controller('leave-type-configs')
export class LeaveTypeConfigsController {
  constructor(
    private readonly leaveTypeConfigsService: LeaveTypeConfigsService,
  ) {}

  // POST /leave-type-configs
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateLeaveTypeConfigDto) {
    return this.leaveTypeConfigsService.create(dto);
  }

  // GET /leave-type-configs
  @Get()
  findAll() {
    return this.leaveTypeConfigsService.findAll();
  }

  // GET /leave-type-configs/leave-type/:leaveTypeId
  @Get('leave-type/:leaveTypeId')
  findByLeaveType(@Param('leaveTypeId') leaveTypeId: string) {
    return this.leaveTypeConfigsService.findByLeaveType(leaveTypeId);
  }

  // GET /leave-type-configs/country/:country
  @Get('country/:country')
  findByCountry(@Param('country') country: string) {
    return this.leaveTypeConfigsService.findByCountry(country);
  }

  // GET /leave-type-configs/:id
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.leaveTypeConfigsService.findOne(id);
  }

  // PATCH /leave-type-configs/:id
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeaveTypeConfigDto,
  ) {
    return this.leaveTypeConfigsService.update(id, dto);
  }

  // DELETE /leave-type-configs/:id
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.leaveTypeConfigsService.remove(id);
  }
}
