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

  describe('sendToMany', () => {
    it('reports every recipient as succeeded when sendMail resolves', async () => {
      const result = await service.sendToMany(['a@b.com', 'c@d.com'], {
        message: 'Test message',
      });

      expect(result).toEqual({
        succeeded: ['a@b.com', 'c@d.com'],
        failed: [],
      });
    });

    it('separates succeeded and failed recipients instead of throwing', async () => {
      mockMailerService.sendMail
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('SMTP down'));

      const result = await service.sendToMany(['a@b.com', 'c@d.com'], {
        message: 'Test message',
      });

      expect(result).toEqual({
        succeeded: ['a@b.com'],
        failed: ['c@d.com'],
      });
    });
  });
});