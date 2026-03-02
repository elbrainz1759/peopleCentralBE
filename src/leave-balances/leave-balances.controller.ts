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
} from '@nestjs/common';
import { LeaveBalancesService } from './leave-balances.service';
import { BulkUploadLeaveBalanceDto } from './dto/bulk-upload-leave-balance.dto';
import { MonthlyAccrualDto } from './dto/monthly-accrual.dto';

@Controller('leave-balances')
export class LeaveBalancesController {
  constructor(private readonly leaveBalancesService: LeaveBalancesService) {}

  // POST /leave-balances/bulk-upload  (HR uploads everybody's balance)
  @Post('bulk-upload')
  @HttpCode(HttpStatus.CREATED)
  bulkUpload(@Body() dto: BulkUploadLeaveBalanceDto) {
    return this.leaveBalancesService.bulkUpload(dto);
  }

  // POST /leave-balances/accrue  (Trigger monthly accrual for annual leave)
  @Post('accrue')
  @HttpCode(HttpStatus.OK)
  accrue(@Body() dto: MonthlyAccrualDto) {
    return this.leaveBalancesService.monthlyAccrue(dto);
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
