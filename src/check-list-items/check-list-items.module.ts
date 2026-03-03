import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { CheckListItemsService } from './check-list-items.service';
import { CheckListItemsController } from './check-list-items.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [CheckListItemsController],
  providers: [CheckListItemsService],
  exports: [CheckListItemsService],
})
export class CheckListItemsModule {}
