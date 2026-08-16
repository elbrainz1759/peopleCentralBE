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
import { MailService } from 'src/mail/mail.service';

@Controller('data-tracker')
export class DataTrackerController {
  constructor(
    private readonly dataTrackerService: DataTrackerService,
    private readonly mailService: MailService,
  ) {}

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

  // Called daily by your cron job
  @Post('cron/trigger')
  async triggerNotifications() {
    const due = await this.dataTrackerService.getDueNotifications();
    let sent = 0;

    for (const item of due) {
      const { failed } = await this.mailService.sendToMany(
        item.recipient_emails,
        {
          subject: `Reminder: "${item.title}" is due soon`,
          subjectFull: 'Data Tracker Reminder',
          message: `This is a reminder that "${item.title}" is due on ${item.end_date}. You are receiving this because you are ${item.days_before} days away from the deadline.`,
          siteName: 'PeopleCentral',
        },
      );

      // Only mark as sent once every recipient actually received it — if any
      // failed (e.g. SMTP outage mid-run), leave it unmarked so the next
      // cron run retries the whole thing. There's no per-recipient tracking,
      // so a partial failure has to be treated as a full retry.
      if (failed.length === 0) {
        await this.dataTrackerService.markNotificationSent(
          item.unique_id,
          item.days_before,
        );
        sent++;
      }
    }

    return { triggered: due.length, sent, items: due };
  }
}
