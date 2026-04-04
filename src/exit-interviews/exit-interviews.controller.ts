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

@Controller('exit-interviews')
export class ExitInterviewController {
  constructor(private readonly exitInterviewService: ExitInterviewService) {}

  // GET /exit-interviews/dashboard
  @Get('dashboard')
  getDashboard(): Promise<Record<string, any>> {
    return this.exitInterviewService.getDashboard();
  }

  // POST /exit-interviews
  @Post()
  create(@Body() dto: CreateExitInterviewDto): Promise<ExitInterviewDetail> {
    return this.exitInterviewService.create(dto);
  }

  // GET /exit-interviews
  @Get()
  findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ExitInterviewDetail>> {
    return this.exitInterviewService.findAll(query);
  }

  // GET /exit-interviews/pending/:department  — Operations | Finance queue
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
  ): Promise<ClearanceStatusResult> {
    return this.exitInterviewService.clearDepartment(
      id,
      dto.department,
      dto.checkListItemIds,
      dto.notes,
    );
  }

  // PATCH /exit-interviews/:id/finalize  (HR final submission)
  @Patch(':id/finalize')
  finalize(@Param('id') id: string): Promise<ExitInterviewDetail> {
    return this.exitInterviewService.finalize(id);
  }

  // PATCH /exit-interviews/:id
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateExitInterviewDto,
  ): Promise<ExitInterviewDetail> {
    return this.exitInterviewService.update(id, dto);
  }

  // DELETE /exit-interviews/:id
  @Delete(':id')
  remove(@Param('id') id: string): Promise<{ message: string }> {
    return this.exitInterviewService.remove(id);
  }
}
