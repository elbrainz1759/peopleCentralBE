// src/mail/mail.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

export interface SendMailOptions {
  to: string | string[];
  subject?: string;
  message: string;
  subjectFull?: string;
  siteName?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly mailerService: MailerService) {}

  async sendCaseNotification(options: SendMailOptions): Promise<void> {
    const {
      to,
      subject = 'Mercy Corps CARM Tracking Tool',
      message,
      subjectFull = 'New Case Notification',
      siteName = 'Mercy Corps',
    } = options;

    const toList = Array.isArray(to) ? to.join(', ') : to; // ← move here

    try {
      await this.mailerService.sendMail({
        to,
        subject,
        template: 'notification',
        context: {
          message_full: message,
          subject_full: subjectFull,
          site_name: siteName,
        },
      });
      this.logger.log(`Email sent successfully to ${toList}`);
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${toList}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  // For bulk sends — mirrors your sendToLocation pattern
  async sendToMany(
    recipients: string[],
    options: Omit<SendMailOptions, 'to'>,
  ): Promise<void> {
    const results = await Promise.allSettled(
      recipients.map((email) =>
        this.sendCaseNotification({ ...options, to: email }),
      ),
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Failed for recipient ${recipients[index]}: ${result.reason}`,
        );
      }
    });
  }
}
