import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { LeaveBalancesService } from './leave-balances.service';
import { BulkUploadLeaveBalanceDto } from './dto/bulk-upload-leave-balance.dto';
import { AccrueLeaveBalanceDto } from './dto/accrue-leave-balance.dto';
import { RolloverLeaveBalanceDto } from './dto/rollover-leave-balance.dto';
import { RequestUser } from 'src/common/interfaces/request-user.interface';
import type { Request } from 'express';

@Controller('leave-balances')
export class LeaveBalancesController {
  constructor(private readonly leaveBalancesService: LeaveBalancesService) {}

  // POST /leave-balances/bulk-upload
  @Post('bulk-upload')
  @HttpCode(HttpStatus.CREATED)
  bulkUpload(@Body() dto: BulkUploadLeaveBalanceDto, @Req() req: Request) {
    const user = req.user as RequestUser;
    return this.leaveBalancesService.bulkUpload(dto, user);
  }

  // POST /leave-balances/accrue
  @Post('accrue')
  @HttpCode(HttpStatus.OK)
  accrue(@Body() dto: AccrueLeaveBalanceDto, @Req() req: Request) {
    const user = req.user as RequestUser;
    return this.leaveBalancesService.monthlyAccrue(
      dto.leaveTypeId,
      user.email || 'System',
    );
  }

  // POST /leave-balances/rollover
  @Post('rollover')
  @HttpCode(HttpStatus.OK)
  rollover(@Body() dto: RolloverLeaveBalanceDto, @Req() req: Request) {
    const user = req.user as RequestUser;
    return this.leaveBalancesService.rolloverYear(
      dto.annualLeaveTypeId,
      user.email || 'System',
    );
  }

  // GET /leave-balances?page=1&limit=20&year=2026&search=john
  // Returns all staff with their balances nested by leave type.
  @Get()
  findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('year') year?: number,
    @Query('search') search?: string,
  ) {
    return this.leaveBalancesService.findAll(
      Number(page),
      Number(limit),
      year ? Number(year) : undefined,
      search,
    );
  }

  // GET /leave-balances/staff/:staffId
  // Returns one staff member's balances across all leave types for the current year.
  // NOTE: must be declared before any generic /:id route to avoid route shadowing.
  @Get('staff/:staffId')
  findByStaff(@Param('staffId', ParseIntPipe) staffId: number) {
    return this.leaveBalancesService.findByStaff(staffId);
  }

  // GET /leave-balances/staff/:staffId/transactions?page=1&limit=20
  @Get('staff/:staffId/transactions')
  findTransactionsByStaff(
    @Param('staffId', ParseIntPipe) staffId: number,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.leaveBalancesService.findTransactionsByStaff(
      staffId,
      Number(page),
      Number(limit),
    );
  }

  // GET /leave-balances/accrual-log?leaveTypeId=xxx&year=2026
  @Get('accrual-log')
  findAccrualLog(
    @Query('leaveTypeId') leaveTypeId?: string,
    @Query('year') year?: number,
  ) {
    return this.leaveBalancesService.findAccrualLog(
      leaveTypeId,
      year ? Number(year) : undefined,
    );
  }
}
