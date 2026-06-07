import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import {
  ExitInterviewService,
  ExitInterviewDetail,
  ClearanceStatusResult,
  PaginatedResult,
} from './exit-interviews.service';
import { CreateExitInterviewDto } from './dto/create-exit-interview.dto';
import { UpdateExitInterviewDto } from './dto/update-exit-interview.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { ClearDepartmentDto } from './dto/clear-department.dto';
import type { Request } from 'express';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

@Controller('exit-interviews')
export class ExitInterviewController {
  constructor(private readonly exitInterviewService: ExitInterviewService) {}

  // GET /exit-interviews/dashboard
  @Get('dashboard')
  getDashboard(): Promise<Record<string, unknown>> {
    return this.exitInterviewService.getDashboard();
  }

  // POST /exit-interviews
  @Post()
  create(
    @Body() dto: CreateExitInterviewDto,
    @Req() req: Request,
  ): Promise<ExitInterviewDetail> {
    const user = req.user as RequestUser;
    return this.exitInterviewService.create(dto, user);
  }

  // GET /exit-interviews
  @Get()
  findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ExitInterviewDetail>> {
    return this.exitInterviewService.findAll(query);
  }

  // GET /exit-interviews/pending/:department
  @Get('pending/:department')
  findPendingByDepartment(
    @Param('department') department: string,
  ): Promise<PaginatedResult<ExitInterviewDetail>> {
    return this.exitInterviewService.findPendingByDepartment(department);
  }

  // GET /exit-interviews/unique/:uniqueId
  @Get('unique/:uniqueId')
  findByUniqueId(
    @Param('uniqueId') uniqueId: string,
  ): Promise<ExitInterviewDetail> {
    return this.exitInterviewService.findByUniqueId(uniqueId);
  }

  // GET /exit-interviews/staff/:staffId
  @Get('staff/:staffId')
  findByStaffId(
    @Param('staffId', ParseIntPipe) staffId: number,
  ): Promise<ExitInterviewDetail[]> {
    return this.exitInterviewService.findByStaffId(staffId);
  }

  // GET /exit-interviews/supervisor/:supervisorId
  @Get('supervisor/:supervisorId')
  findBySupervisorId(
    @Param('supervisorId') supervisorId: string,
  ): Promise<ExitInterviewDetail[]> {
    return this.exitInterviewService.findBySupervisorId(supervisorId);
  }

  // GET /exit-interviews/:id/clearance-status
  @Get(':id/clearance-status')
  getClearanceStatus(@Param('id') id: string): Promise<ClearanceStatusResult> {
    return this.exitInterviewService.getClearanceStatus(id);
  }

  // GET /exit-interviews/:id/audit-log
  @Get(':id/audit-log')
  getAuditLog(@Param('id') id: string) {
    return this.exitInterviewService.getAuditLog(id);
  }

  // GET /exit-interviews/:id
  @Get(':id')
  findOne(@Param('id') id: string): Promise<ExitInterviewDetail> {
    return this.exitInterviewService.findOne(id);
  }

  // POST /exit-interviews/:id/clear
  @Post(':id/clear')
  clearDepartment(
    @Param('id') id: string,
    @Body() dto: ClearDepartmentDto,
    @Req() req: Request,
  ): Promise<ClearanceStatusResult> {
    const user = req.user as RequestUser;
    return this.exitInterviewService.clearDepartment(
      id,
      dto.department as
        | 'Supervisor'
        | 'HR'
        | 'Operations'
        | 'Finance'
        | 'HR_Director',
      user.email,
      dto.checkListItemIds,
      dto.notes,
    );
  }

  // PATCH /exit-interviews/:id/finalize
  @Patch(':id/finalize')
  finalize(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<ExitInterviewDetail> {
    const user = req.user as RequestUser;
    return this.exitInterviewService.finalize(id, user);
  }

  // PATCH /exit-interviews/:id
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateExitInterviewDto,
    @Req() req: Request,
  ): Promise<ExitInterviewDetail> {
    const user = req.user as RequestUser;
    return this.exitInterviewService.update(id, dto, user);
  }

  // DELETE /exit-interviews/:id
  @Delete(':id')
  remove(@Param('id') id: string): Promise<{ message: string }> {
    return this.exitInterviewService.remove(id);
  }
}
