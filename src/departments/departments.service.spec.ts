import { DepartmentsService } from './departments.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('DepartmentsService', () => {
  let service: DepartmentsService;
  const mockPool: any = { getConnection: jest.fn() };
  const mockConn: any = { query: jest.fn(), execute: jest.fn(), release: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new DepartmentsService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('create conflicts on duplicate name', async () => {
    mockConn.query.mockResolvedValueOnce([[{ id: 1 }]]);
    await expect(service.create({ name: 'Dept' } as any)).rejects.toThrow(ConflictException);
  });

  it('findOne throws when missing', async () => {
    mockConn.query.mockResolvedValue([[]]);
    await expect(service.findOne(5)).rejects.toThrow(NotFoundException);
  });
});
