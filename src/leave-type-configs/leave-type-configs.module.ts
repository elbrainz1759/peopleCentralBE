import { Module } from '@nestjs/common';
import { LeaveTypeConfigsService } from './leave-type-configs.service';
import { LeaveTypeConfigsController } from './leave-type-configs.controller';

@Module({
  controllers: [LeaveTypeConfigsController],
  providers: [LeaveTypeConfigsService],
  exports: [LeaveTypeConfigsService],
})
export class LeaveTypeConfigsModule {}
