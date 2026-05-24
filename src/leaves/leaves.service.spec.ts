import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { LeavesService } from './leaves.service';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

describe('LeavesService', () => {
  let service: LeavesService;

  const mockPool: any = {
    getConnection: jest.fn(),
  };

  const mockConn: any = {
    query: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };

  const mockFindOneConn: any = {
    query: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };

  const mockUser: RequestUser = {
    id: 1,
    email: 'hr@mercycorps.org',
    role: 'Admin',
    unique_id: 'abc123',
    first_name: 'HR',
    last_name: 'User',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    service = new LeavesService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto: any = {
      staffId: 1,
      leaveTypeId: 'annual-leave',
      reason: 'Vacation',
      handoverNote: 'Handover completed',
      leaveDuration: [
        {
          startDate: '2026-05-25',
          endDate: '2026-05-26',
        },
      ],
    };

    it('throws ConflictException when leave overlaps existing request', async () => {
      mockConn.query.mockResolvedValueOnce([
        [
          {
            start_date: '2026-05-25',
            end_date: '2026-05-26',
          },
        ],
      ]);

      await expect(service.create(dto, mockUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws BadRequestException when staff record not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]); // existing durations
      mockConn.query.mockResolvedValueOnce([[]]); // staff not found

      await expect(service.create(dto, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when leave policy not configured', async () => {
      mockConn.query.mockResolvedValueOnce([[]]); // existing durations
      mockConn.query.mockResolvedValueOnce([[{ country: 'NG' }]]); // staff
      mockConn.query.mockResolvedValueOnce([[]]); // config not found

      await expect(service.create(dto, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates leave and returns it', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[]]); // existing durations

      mockConn.query.mockResolvedValueOnce([[{ country: 'NG' }]]); // staff country

      mockConn.query.mockResolvedValueOnce([
        [
          {
            annual_hours: 160,
            monthly_accrual_hours: null,
          },
        ],
      ]); // leave config

      mockConn.query.mockResolvedValueOnce([[{ used_hours: 0 }]]); // used hours

      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]); // insert leave

      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]); // insert duration

      mockFindOneConn.query.mockResolvedValueOnce([
        [
          {
            id: 1,
            unique_id: 'leave-uid-1',
            staff_id: 1,
            leave_type_id: 'annual-leave',
            reason: 'Vacation',
            handover_note: 'Handover completed',
            total_hours: 16,
            status: 'Pending',
            created_by: mockUser.email,
          },
        ],
      ]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [
          {
            id: 1,
            leave_id: 1,
            start_date: '2026-05-25',
            end_date: '2026-05-26',
            hours: 16,
          },
        ],
      ]);

      const result = await service.create(dto, mockUser);

      expect(result.id).toBe(1);
      expect(result.status).toBe('Pending');
      expect(mockConn.beginTransaction).toHaveBeenCalled();
      expect(mockConn.commit).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns paginated leaves', async () => {
      const query: any = {
        page: 1,
        limit: 10,
        status: 'Pending',
        staffId: 1,
      };

      const rows = [
        {
          id: 1,
          staff_id: 1,
          status: 'Pending',
        },
      ];

      mockConn.query.mockResolvedValueOnce([[{ total: 1 }]]);
      mockConn.query.mockResolvedValueOnce([rows]);

      const result = await service.findAll(query);

      expect(result.data).toEqual(rows);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        last_page: 1,
      });
    });
  });

  describe('findOne', () => {
    it('returns leave with durations', async () => {
      const leave = {
        id: 1,
        staff_id: 1,
        status: 'Pending',
      };

      const durations = [
        {
          id: 1,
          leave_id: 1,
          start_date: '2026-05-25',
          end_date: '2026-05-26',
          hours: 16,
        },
      ];

      mockConn.query.mockResolvedValueOnce([[leave]]);
      mockConn.query.mockResolvedValueOnce([durations]);

      const result = await service.findOne(1);

      expect(result).toEqual({
        ...leave,
        durations,
      });
    });

    it('throws NotFoundException when leave not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('review', () => {
    it('throws NotFoundException when leave not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.review(1)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when leave is not Pending', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'Approved' }]]);

      await expect(service.review(1)).rejects.toThrow(BadRequestException);
    });

    it('reviews leave and returns updated leave', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'Pending' }]]);
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, status: 'Reviewed' }],
      ]);
      mockFindOneConn.query.mockResolvedValueOnce([[]]);

      const result = await service.review(1);

      expect(result.status).toBe('Reviewed');
    });
  });

  describe('approve', () => {
    it('throws NotFoundException when leave not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.approve(1, 'system')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when leave is not Reviewed', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'Pending' }]]);

      await expect(service.approve(1, 'system')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('approves leave and returns updated leave', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([
        [
          {
            id: 1,
            staff_id: 1,
            leave_type_id: 'annual-leave',
            total_hours: 16,
            status: 'Reviewed',
          },
        ],
      ]);

      mockConn.query.mockResolvedValueOnce([[{ country: 'NG' }]]);
      mockConn.query.mockResolvedValueOnce([
        [{ annual_hours: 160, monthly_accrual_hours: null }],
      ]);
      mockConn.query.mockResolvedValueOnce([[{ used_hours: 0 }]]);
      mockConn.query.mockResolvedValueOnce([[{ id: 5 }]]);

      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, status: 'Approved' }],
      ]);
      mockFindOneConn.query.mockResolvedValueOnce([[]]);

      const result = await service.approve(1, 'system');

      expect(result.status).toBe('Approved');
      expect(mockConn.beginTransaction).toHaveBeenCalled();
      expect(mockConn.commit).toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('throws NotFoundException when leave not found', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.reject(1, 'system')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when leave cannot be rejected', async () => {
      mockConn.query.mockResolvedValueOnce([[{ id: 1, status: 'Rejected' }]]);

      await expect(service.reject(1, 'system')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects pending leave and returns updated leave', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([
        [
          {
            id: 1,
            staff_id: 1,
            leave_type_id: 'annual-leave',
            total_hours: 16,
            status: 'Pending',
            created_at: new Date(),
          },
        ],
      ]);

      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, status: 'Rejected' }],
      ]);
      mockFindOneConn.query.mockResolvedValueOnce([[]]);

      const result = await service.reject(1, 'system');

      expect(result.status).toBe('Rejected');
      expect(mockConn.beginTransaction).toHaveBeenCalled();
      expect(mockConn.commit).toHaveBeenCalled();
    });

    it('rejects approved leave and restores balance', async () => {
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockFindOneConn);

      mockConn.query.mockResolvedValueOnce([
        [
          {
            id: 1,
            staff_id: 1,
            leave_type_id: 'annual-leave',
            total_hours: 16,
            status: 'Approved',
            created_at: new Date('2026-05-24'),
          },
        ],
      ]);

      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockConn.query.mockResolvedValueOnce([[{ id: 5 }]]);
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);

      mockFindOneConn.query.mockResolvedValueOnce([
        [{ id: 1, status: 'Rejected' }],
      ]);
      mockFindOneConn.query.mockResolvedValueOnce([[]]);

      const result = await service.reject(1, 'system');

      expect(result.status).toBe('Rejected');
      expect(mockConn.commit).toHaveBeenCalled();
    });
  });
});