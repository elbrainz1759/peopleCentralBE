import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { LeaveTypeConfigsService } from './leave-type-configs.service';

describe('LeaveTypeConfigsService', () => {
  let service: LeaveTypeConfigsService;
  const mockPool: any = { getConnection: jest.fn() };
  const mockConn: any = {
    query: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConn);
    mockConn.release.mockResolvedValue(undefined);
    service = new LeaveTypeConfigsService(mockPool as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  describe('create', () => {
    const dto: any = {
      leaveTypeId: 1,
      country: 'Nigeria',
      annualHours: 200,
      monthlyAccrualHours: 10,
    };
    const savedRow = {
      id: 1,
      leave_type_id: 1,
      country: 'Nigeria',
      annual_hours: 200,
      monthly_accrual_hours: 10,
      leave_type_name: 'Annual Leave',
    };

    it('creates a config and returns the saved record', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ id: 1 }]]) // leave_types exists check
        .mockResolvedValueOnce([[]]) // no conflict
        .mockResolvedValueOnce([{ insertId: 1 }]) // INSERT
        // findOne internal call (separate connection)
        .mockResolvedValueOnce([[savedRow]]); // SELECT for findOne

      // findOne opens its own connection — mock getConnection again
      mockPool.getConnection
        .mockResolvedValueOnce(mockConn) // create() connection
        .mockResolvedValueOnce(mockConn); // findOne() connection

      const result = await service.create(dto);

      expect(result).toEqual(savedRow);
      expect(mockConn.release).toHaveBeenCalledTimes(2);
    });

    it('throws BadRequestException when leave type does not exist', async () => {
      mockConn.query.mockResolvedValueOnce([[]]); // leave type not found

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      expect(mockConn.release).toHaveBeenCalled();
    });

    it('throws ConflictException when config already exists for that leave type + country', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ id: 1 }]]) // leave type exists
        .mockResolvedValueOnce([[{ id: 5 }]]); // conflict found

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('defaults monthlyAccrualHours to null when not provided', async () => {
      const dtoNoAccrual: any = {
        leaveTypeId: 2,
        country: 'Nigeria',
        annualHours: 90,
      };
      mockConn.query
        .mockResolvedValueOnce([[{ id: 2 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 2 }])
        .mockResolvedValueOnce([[{ id: 2, monthly_accrual_hours: null }]]);

      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockConn);

      await service.create(dtoNoAccrual);

      const insertCall = mockConn.query.mock.calls[2];
      expect(insertCall[1]).toContain(null); // monthlyAccrualHours → null
    });

    it('throws InternalServerErrorException on unexpected db error', async () => {
      mockConn.query.mockRejectedValueOnce(new Error('db failure'));

      await expect(service.create(dto)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockConn.release).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('findAll', () => {
    it('returns all configs ordered by leave type name and country', async () => {
      const rows = [
        { id: 1, country: 'Nigeria', leave_type_name: 'Annual Leave' },
        { id: 2, country: 'Kenya', leave_type_name: 'Sick Leave' },
      ];
      mockConn.query.mockResolvedValueOnce([rows]);

      const result = await service.findAll();

      expect(result).toEqual(rows);
      expect(mockConn.release).toHaveBeenCalled();

      const sql = mockConn.query.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY lt.name ASC');
    });

    it('throws InternalServerErrorException on db error', async () => {
      mockConn.query.mockRejectedValueOnce(new Error('fail'));

      await expect(service.findAll()).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockConn.release).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('findByLeaveType', () => {
    it('returns configs filtered by leave type id', async () => {
      const rows = [{ id: 1, leave_type_id: 1, country: 'Nigeria' }];
      mockConn.query.mockResolvedValueOnce([rows]);

      const result = await service.findByLeaveType(1);

      expect(result).toEqual(rows);
      const [sql, params] = mockConn.query.mock.calls[0];
      expect(sql).toContain('WHERE ltcc.leave_type_id = ?');
      expect(params).toEqual([1]);
    });

    it('returns empty array when no configs exist for the leave type', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      const result = await service.findByLeaveType(99);

      expect(result).toEqual([]);
    });

    it('throws InternalServerErrorException on db error', async () => {
      mockConn.query.mockRejectedValueOnce(new Error('fail'));

      await expect(service.findByLeaveType(1)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('findByCountry', () => {
    it('returns configs filtered by country', async () => {
      const rows = [
        { id: 1, country: 'Nigeria', leave_type_name: 'Annual Leave' },
        { id: 3, country: 'Nigeria', leave_type_name: 'Sick Leave' },
      ];
      mockConn.query.mockResolvedValueOnce([rows]);

      const result = await service.findByCountry('Nigeria');

      expect(result).toEqual(rows);
      const [sql, params] = mockConn.query.mock.calls[0];
      expect(sql).toContain('WHERE ltcc.country = ?');
      expect(params).toEqual(['Nigeria']);
    });

    it('returns empty array when no configs exist for the country', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      const result = await service.findByCountry('Zimbabwe');

      expect(result).toEqual([]);
    });

    it('throws InternalServerErrorException on db error', async () => {
      mockConn.query.mockRejectedValueOnce(new Error('fail'));

      await expect(service.findByCountry('Nigeria')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('findOne', () => {
    it('returns the config when found', async () => {
      const row = {
        id: 1,
        country: 'Nigeria',
        leave_type_name: 'Annual Leave',
      };
      mockConn.query.mockResolvedValueOnce([[row]]);

      const result = await service.findOne(1);

      expect(result).toEqual(row);
    });

    it('throws NotFoundException when config does not exist', async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });

    it('throws InternalServerErrorException on db error', async () => {
      mockConn.query.mockRejectedValueOnce(new Error('fail'));

      await expect(service.findOne(1)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('update', () => {
    const existingRow = {
      id: 1,
      leave_type_id: 1,
      country: 'Nigeria',
      annual_hours: 200,
      monthly_accrual_hours: 10,
    };

    it('updates provided fields and returns the updated record', async () => {
      const updatedRow = { ...existingRow, annual_hours: 240 };
      mockConn.query
        .mockResolvedValueOnce([[existingRow]]) // SELECT current
        .mockResolvedValueOnce([{}]) // UPDATE
        .mockResolvedValueOnce([[updatedRow]]); // findOne SELECT

      mockPool.getConnection
        .mockResolvedValueOnce(mockConn) // update() connection
        .mockResolvedValueOnce(mockConn); // findOne() connection

      const result = await service.update(1, { annualHours: 240 });

      expect(result.annual_hours).toBe(240);

      const updateSql = mockConn.query.mock.calls[1][0] as string;
      expect(updateSql).toContain('annual_hours = ?');
    });

    it('throws NotFoundException when config does not exist', async () => {
      mockConn.query.mockResolvedValueOnce([[]]); // not found

      await expect(service.update(999, { annualHours: 100 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when dto is empty (no fields to update)', async () => {
      mockConn.query.mockResolvedValueOnce([[existingRow]]);

      await expect(service.update(1, {})).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when the new leave_type + country combo already exists', async () => {
      mockConn.query
        .mockResolvedValueOnce([[existingRow]]) // SELECT current
        .mockResolvedValueOnce([[{ id: 9 }]]); // conflict check → taken by another row

      await expect(service.update(1, { country: 'Kenya' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('allows updating monthlyAccrualHours to null (convert to fixed entitlement)', async () => {
      const updatedRow = { ...existingRow, monthly_accrual_hours: null };
      mockConn.query
        .mockResolvedValueOnce([[existingRow]])
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([[updatedRow]]);

      mockPool.getConnection
        .mockResolvedValueOnce(mockConn)
        .mockResolvedValueOnce(mockConn);

      const result = await service.update(1, { monthlyAccrualHours: null });

      const updateCall = mockConn.query.mock.calls[1];
      expect(updateCall[1]).toContain(null);
      expect(result.monthly_accrual_hours).toBeNull();
    });

    it('throws InternalServerErrorException on unexpected db error', async () => {
      mockConn.query.mockRejectedValueOnce(new Error('fail'));

      await expect(service.update(1, { annualHours: 100 })).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockConn.release).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('remove', () => {
    it('deletes the config and returns confirmation', async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ id: 1 }]]) // exists check
        .mockResolvedValueOnce([{}]); // DELETE

      const result = await service.remove(1);

      expect(result).toEqual({ deleted: true, id: 1 });
      const deleteSql = mockConn.query.mock.calls[1][0] as string;
      expect(deleteSql).toContain('DELETE FROM leave_type_country_config');
    });

    it('throws NotFoundException when config does not exist', async () => {
      mockConn.query.mockResolvedValueOnce([[]]); // not found

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });

    it('throws InternalServerErrorException on unexpected db error', async () => {
      mockConn.query.mockRejectedValueOnce(new Error('fail'));

      await expect(service.remove(1)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockConn.release).toHaveBeenCalled();
    });
  });
});
