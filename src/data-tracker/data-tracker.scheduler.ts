import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataTrackerService } from './data-tracker.service';

@Injectable()
export class DataTrackerScheduler {
  private readonly logger = new Logger(DataTrackerScheduler.name);

  constructor(private readonly dataTrackerService: DataTrackerService) {}

  // Runs daily at 07:00 server time. Safe to run alongside (or instead of)
  // an external cron hitting POST /data-tracker/cron/trigger — due items are
  // only sent once, so an overlapping trigger just finds nothing left to do.
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async handleDailyReminders() {
    try {
      const result = await this.dataTrackerService.runDueNotifications();
      this.logger.log(
        `Data tracker reminders: ${result.sent}/${result.triggered} sent`,
      );
    } catch (err) {
      this.logger.error(
        'Data tracker daily reminder run failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
