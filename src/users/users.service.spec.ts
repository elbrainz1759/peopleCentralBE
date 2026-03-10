import { UsersService } from './users.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  const mockPool = {
    query: jest.fn(),
  } as { query: jest.Mock };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new UsersService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('throws when not found', async () => {
      mockPool.query.mockResolvedValue([[]]);
      await expect(service.findOne('u')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('errors when no update fields provided', async () => {
      mockPool.query.mockResolvedValueOnce([[{ id: 1 }]]);
      await expect(service.update('u', {} as any)).rejects.toThrow(
        BadRequestException,
      );
    });
    it('errors when user not found', async () => {
      mockPool.query.mockResolvedValue([[]]);
      await expect(
        service.update('u', { role: 'Admin' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
