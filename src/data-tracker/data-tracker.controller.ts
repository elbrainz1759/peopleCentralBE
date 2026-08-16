import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { DataTrackerService } from './data-tracker.service';
import { CreateDataTrackerDto } from './dto/create-data-tracker.dto';
import { UpdateDataTrackerDto } from './dto/update-data-tracker.dto';
import { FindDataTrackerDto } from './dto/find-data-tracker.dto';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

@Controller('data-tracker')
export class DataTrackerController {
  constructor(private readonly dataTrackerService: DataTrackerService) {}

  @Post()
  create(@Body() dto: CreateDataTrackerDto, @Req() req: Request) {
    const user = req.user as RequestUser;

    return this.dataTrackerService.create(dto, user);
  }

  @Get()
  findAll(@Query() query: FindDataTrackerDto) {
    return this.dataTrackerService.findAll(query);
  }

  @Get(':unique_id')
  findOne(@Param('unique_id') unique_id: string) {
    return this.dataTrackerService.findByUniqueId(unique_id);
  }

  @Patch(':unique_id')
  update(
    @Param('unique_id') unique_id: string,
    @Body() dto: UpdateDataTrackerDto,
  ) {
    return this.dataTrackerService.update(unique_id, dto);
  }

  @Delete(':unique_id')
  remove(@Param('unique_id') unique_id: string) {
    return this.dataTrackerService.remove(unique_id);
  }

  // Runs automatically daily via DataTrackerScheduler (@Cron). Kept as a
  // manual endpoint too, for ops use — e.g. re-running after fixing an SMTP
  // outage without waiting for the next scheduled run.
  @Post('cron/trigger')
  triggerNotifications() {
    return this.dataTrackerService.runDueNotifications();
  }
}
