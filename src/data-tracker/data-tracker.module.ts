import { Module } from '@nestjs/common';
import { DataTrackerController } from './data-tracker.controller';
import { DataTrackerService } from './data-tracker.service';
import { DataTrackerScheduler } from './data-tracker.scheduler';
import { DatabaseModule } from '../database/database.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [DatabaseModule, MailModule],
  controllers: [DataTrackerController],
  providers: [DataTrackerService, DataTrackerScheduler],
  exports: [DataTrackerService],
})
export class DataTrackerModule {}
