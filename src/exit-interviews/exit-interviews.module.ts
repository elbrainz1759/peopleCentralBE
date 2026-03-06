import { Module } from '@nestjs/common';
import { ExitInterviewController } from './exit-interviews.controller';
import { ExitInterviewService } from './exit-interviews.service';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ExitInterviewController],
  providers: [ExitInterviewService],
  exports: [ExitInterviewService],
})
export class ExitInterviewModule {}
