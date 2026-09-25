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
import { RejectDepartmentDto } from './dto/reject-department.dto';
import type { Request } from 'express';
import { RequestUser } from 'src/common/interfaces/request-user.interface';
import { Roles } from '../decorators/roles.decorator';

// Rehire eligibility is confidential — set by the supervisor at their
// clearance step, visible only to HR/HR Lead/Superadmin. Every other
// reader (including the employee's own "my requests" view, which reuses
// these same endpoints) gets it stripped out.
const CONFIDENTIAL_FIELDS = [
  'rehire_eligible',
  'rehire_ineligible_reason',
] as const;

function redact<T extends object>(
  record: T,
  callerRole: string | undefined,
): T {
  if (callerRole && ['HR', 'HR Lead', 'Superadmin'].includes(callerRole)) return record;
  const copy = { ...record } as Record<string, unknown>;
  for (const field of CONFIDENTIAL_FIELDS) delete copy[field];
  return copy as T;
}

// The Supervisor's clearance comment is meant for HR/HR Lead only — not
// for the Operations or Finance reviewers who see the same interview at
// later stages. Strip it from any clearance-history response for anyone
// else; the frontend already drops history entries with no `notes`, so
// this also makes the empty Supervisor entry disappear from the list.
function redactSupervisorNotes(
  result: ClearanceStatusResult,
  callerRole: string | undefined,
): ClearanceStatusResult {
  if (callerRole && ['HR', 'HR Lead', 'Superadmin'].includes(callerRole)) return result;
  if (!result?.clearances) return result;
  return {
    ...result,
    clearances: result.clearances.map((c) =>
      c.department === 'Supervisor' ? { ...c, notes: null } : c,
    ),
  };
}

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
  async findAll(
    @Query() query: PaginationQueryDto,
    @Req() req: Request,
  ): Promise<PaginatedResult<ExitInterviewDetail>> {
    const user = req.user as RequestUser;
    const result = await this.exitInterviewService.findAll(query);
    return {
      ...result,
      data: result.data.map((r) => redact(r, user?.role)),
    };
  }

  // GET /exit-interviews/pending/:department
  @Get('pending/:department')
  async findPendingByDepartment(
    @Param('department') department: string,
    @Req() req: Request,
  ): Promise<PaginatedResult<ExitInterviewDetail>> {
    const user = req.user as RequestUser;
    const result =
      await this.exitInterviewService.findPendingByDepartment(department);
    return {
      ...result,
      data: result.data.map((r) => redact(r, user?.role)),
    };
  }

  // GET /exit-interviews/unique/:uniqueId
  @Get('unique/:uniqueId')
  async findByUniqueId(
    @Param('uniqueId') uniqueId: string,
    @Req() req: Request,
  ): Promise<ExitInterviewDetail> {
    const user = req.user as RequestUser;
    const result = await this.exitInterviewService.findByUniqueId(uniqueId);
    return redact(result, user?.role);
  }

  // GET /exit-interviews/staff/:staffId
  @Get('staff/:staffId')
  async findByStaffId(
    @Param('staffId', ParseIntPipe) staffId: number,
    @Req() req: Request,
  ): Promise<ExitInterviewDetail[]> {
    const user = req.user as RequestUser;
    const result = await this.exitInterviewService.findByStaffId(staffId);
    return result.map((r) => redact(r, user?.role));
  }

  // GET /exit-interviews/supervisor/:supervisorId
  @Get('supervisor/:supervisorId')
  async findBySupervisorId(
    @Param('supervisorId') supervisorId: string,
    @Req() req: Request,
  ): Promise<ExitInterviewDetail[]> {
    const user = req.user as RequestUser;
    const result =
      await this.exitInterviewService.findBySupervisorId(supervisorId);
    return result.map((r) => redact(r, user?.role));
  }

  // GET /exit-interviews/:id/clearance-status
  @Get(':id/clearance-status')
  async getClearanceStatus(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<ClearanceStatusResult> {
    const user = req.user as RequestUser | undefined;
    const result = await this.exitInterviewService.getClearanceStatus(id);
    return redactSupervisorNotes(result, user?.role);
  }

  // GET /exit-interviews/:id/audit-log
  @Get(':id/audit-log')
  getAuditLog(@Param('id') id: string) {
    return this.exitInterviewService.getAuditLog(id);
  }

  // GET /exit-interviews/:id
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<ExitInterviewDetail> {
    const user = req.user as RequestUser;
    const result = await this.exitInterviewService.findOne(id);
    return redact(result, user?.role);
  }

  // POST /exit-interviews/:id/clear
  @Post(':id/clear')
  async clearDepartment(
    @Param('id') id: string,
    @Body() dto: ClearDepartmentDto,
    @Req() req: Request,
  ): Promise<ClearanceStatusResult> {
    const user = req.user as RequestUser;
    const result = await this.exitInterviewService.clearDepartment(
      id,
      dto.department,
      user.email,
      dto.checkListItemIds,
      user.role,
      dto.notes,
      dto.rehireEligible,
      dto.rehireIneligibleReason,
    );
    return redactSupervisorNotes(result, user?.role);
  }

  // POST /exit-interviews/:id/reject
  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectDepartmentDto,
    @Req() req: Request,
  ): Promise<ClearanceStatusResult> {
    const user = req.user as RequestUser;
    const result = await this.exitInterviewService.rejectDepartment(
      id,
      dto.department,
      user.email,
      user.role,
      dto.reason,
    );
    return redactSupervisorNotes(result, user?.role);
  }

  // PATCH /exit-interviews/:id/finalize — HR Lead sign-off. Deliberately
  // excludes plain 'HR' — the final exit approval is HR Lead's exclusive
  // authority, separate from ordinary HR staff (see CLEARANCE_ROLES.HR_Director
  // in the service for the matching /clear and /reject rule).
  @Roles('HR Lead', 'Superadmin')
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
  @Roles('HR', 'HR Lead', 'Superadmin')
  @Delete(':id')
  remove(@Param('id') id: string): Promise<{ message: string }> {
    return this.exitInterviewService.remove(id);
  }
}
