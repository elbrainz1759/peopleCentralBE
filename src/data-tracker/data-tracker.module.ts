import { Module } from '@nestjs/common';
import { DataTrackerController } from './data-tracker.controller';
import { DataTrackerService } from './data-tracker.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [DataTrackerController],
  providers: [DataTrackerService],
  exports: [DataTrackerService],
})
export class DataTrackerModule {}
