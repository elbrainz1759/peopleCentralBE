import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';
import { MailerService } from '@nestjs-modules/mailer';

describe('MailService', () => {
  let service: MailService;

  const mockMailerService = {
    sendMail: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: MailerService,
          useValue: mockMailerService,
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should call sendMail with correct params', async () => {
    await service.sendCaseNotification({
      to: 'test@example.com',
      message: 'Test message',
    });

    expect(mockMailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'test@example.com',
        template: 'notification',
        context: expect.objectContaining({
          message_full: 'Test message',
        }),
      }),
    );
  });
});