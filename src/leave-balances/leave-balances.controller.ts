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

  // POST /leave-balances/bulk-upload  (HR seeds all staff balances for the current year)
  @Post('bulk-upload')
  @HttpCode(HttpStatus.CREATED)
  bulkUpload(@Body() dto: BulkUploadLeaveBalanceDto, @Req() req: Request) {
    const user = req.user as RequestUser;
    return this.leaveBalancesService.bulkUpload(dto, user);
  }

  // POST /leave-balances/accrue  (Trigger monthly accrual — run via PM2 cron on the 1st of each month)
  // Accrual rates are resolved per-staff from leave_type_country_config, not passed in the body.
  @Post('accrue')
  @HttpCode(HttpStatus.OK)
  accrue(@Body() dto: AccrueLeaveBalanceDto, @Req() req: Request) {
    const user = req.user as RequestUser;
    return this.leaveBalancesService.monthlyAccrue(
      dto.leaveTypeId,
      user.email || 'System',
    );
  }

  // POST /leave-balances/rollover  (Trigger year-end rollover — run via PM2 cron on Jan 1)
  // Caps each staff member's unused annual leave at 80hrs and seeds the new year's balance.
  @Post('rollover')
  @HttpCode(HttpStatus.OK)
  rollover(@Body() dto: RolloverLeaveBalanceDto, @Req() req: Request) {
    const user = req.user as RequestUser;
    return this.leaveBalancesService.rolloverYear(
      dto.annualLeaveTypeId,
      user.email || 'System',
    );
  }

  // GET /leave-balances/staff/:staffId
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
}
