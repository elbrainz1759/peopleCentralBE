import { Module } from '@nestjs/common';
import { ExitController } from './exit.controller';
import { ExitService } from './exit.service';

@Module({
  controllers: [ExitController],
  providers: [ExitService]
})
export class ExitModule {}
