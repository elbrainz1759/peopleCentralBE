import { Module } from '@nestjs/common';
import { LeaveTypeConfigsService } from './leave-type-configs.service';
import { LeaveTypeConfigsController } from './leave-type-configs.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],

  controllers: [LeaveTypeConfigsController],
  providers: [LeaveTypeConfigsService],
  exports: [LeaveTypeConfigsService],
})
export class LeaveTypeConfigsModule {}
