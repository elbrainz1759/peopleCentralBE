import { Module } from '@nestjs/common';
import { ExitInterviewController } from './exit-interviews.controller';
import { ExitInterviewService } from './exit-interviews.service';
import { DatabaseModule } from 'src/database/database.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [DatabaseModule, MailModule],
  controllers: [ExitInterviewController],
  providers: [ExitInterviewService],
  exports: [ExitInterviewService],
})
export class ExitInterviewModule {}
