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
  it('throws NotFoundException when user not found', async () => {
    mockPool.query.mockResolvedValueOnce([[]]); // user lookup → empty

    await expect(service.update('u', { role: 'Admin' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws BadRequestException when no fields provided', async () => {
    mockPool.query.mockResolvedValueOnce([[{ id: 1 }]]); // user lookup → found
    // role query never fires — BadRequestException thrown before it

    await expect(service.update('u', {})).rejects.toThrow(BadRequestException);
    expect(mockPool.query).toHaveBeenCalledTimes(1); // only the user lookup
  });

  it('throws BadRequestException when role is invalid', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ id: 1 }]]) // user lookup → found
      .mockResolvedValueOnce([[]]); // role lookup → no match

    await expect(service.update('u', { role: 'Ghost' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('updates role successfully', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ id: 1 }]])        // user lookup
      .mockResolvedValueOnce([[{ name: 'Admin' }]]) // role lookup
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE

    const result = await service.update('u', { role: 'Admin' });

    expect(result).toEqual({ message: 'User updated successfully' });
  });

  it('updates password successfully', async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ id: 1 }]])        // user lookup
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE (no role query)

    const result = await service.update('u', { password: 'newpass123' });

    expect(result).toEqual({ message: 'User updated successfully' });
  });
});
});
