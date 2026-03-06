import { EmployeeService } from './employees.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('EmployeesService', () => {
  let service: EmployeeService;
  const mockPool = {
    query: jest.fn(),
    getConnection: jest.fn(),
  } as { query: jest.Mock; getConnection: jest.Mock };
  const mockConn = {
    query: jest.fn(),
    execute: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new EmployeeService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne/findByUniqueId', () => {
    it('throws when not found', async () => {
      mockPool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);
      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
      await expect(service.findByUniqueId('u')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('errors when no update fields provided', async () => {
      mockPool.query.mockResolvedValueOnce([[{ id: 1 }]]);
      await expect(service.update('u', {} as any)).rejects.toThrow(
        BadRequestException,
      );
    });
    it('errors when employee not exists', async () => {
      mockPool.query.mockResolvedValue([[]]);
      await expect(
        service.update('u', { firstName: 'a' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
