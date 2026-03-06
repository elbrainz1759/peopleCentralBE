import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { DataTrackerService } from './data-tracker.service';
import { CreateDataTrackerDto } from './dto/create-data-tracker.dto';
import { UpdateDataTrackerDto } from './dto/update-data-tracker.dto';
import { FindDataTrackerDto } from './dto/find-data-tracker.dto';

@Controller('data-tracker')
export class DataTrackerController {
  constructor(private readonly dataTrackerService: DataTrackerService) {}

  @Post()
  create(@Body() dto: CreateDataTrackerDto) {
    return this.dataTrackerService.create(dto);
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

  // Called daily by your cron job
  @Post('cron/trigger')
  async triggerNotifications() {
    const due = await this.dataTrackerService.getDueNotifications();

    // TODO: plug in your mail service here
    for (const item of due) {
      console.log(
        `Send email to ${item.recipient_emails.join(', ')} — "${item.title}" ends in ${item.days_before} days`,
      );
      await this.dataTrackerService.markNotificationSent(
        item.unique_id,
        item.days_before,
      );
    }

    return { triggered: due.length, items: due };
  }
}
