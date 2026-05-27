import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { LeavesService } from './leaves.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { CancelLeaveDto } from './dto/cancel-leave.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { RequestUser } from 'src/common/interfaces/request-user.interface';
import type { Request } from 'express';

@Controller('leaves')
export class LeavesController {
  constructor(private readonly leavesService: LeavesService) {}

  // ---------------------------------------------------------------------------
  // POST /leaves
  // Staff submits a new leave request.
  // ---------------------------------------------------------------------------
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateLeaveDto, @Req() req: Request) {
    const user = req.user as RequestUser;
    return this.leavesService.create(dto, user);
  }

  // ---------------------------------------------------------------------------
  // GET /leaves?page=1&limit=10&status=Pending&staffId=1
  // ---------------------------------------------------------------------------
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.leavesService.findAll(query);
  }

  // ---------------------------------------------------------------------------
  // GET /leaves/:id
  // ---------------------------------------------------------------------------
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.leavesService.findOne(id);
  }

  // ---------------------------------------------------------------------------
  // GET /leaves/:id/cancellation
  // Returns the audit record for a cancelled leave.
  // ---------------------------------------------------------------------------
  @Get(':id/cancellation')
  findCancellation(@Param('id', ParseIntPipe) id: number) {
    return this.leavesService.findCancellation(id);
  }

  // ---------------------------------------------------------------------------
  // PATCH /leaves/:id/review  (HR)
  // Moves Pending → Reviewed. Actor name taken from the authenticated user.
  // ---------------------------------------------------------------------------
  @Patch(':id/review')
  review(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = req.user as RequestUser;
    return this.leavesService.review(id, user.email);
  }

  // ---------------------------------------------------------------------------
  // PATCH /leaves/:id/approve  (Supervisor)
  // Moves Reviewed → Approved and deducts hours from the balance.
  // Actor name taken from the authenticated user.
  // ---------------------------------------------------------------------------
  @Patch(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = req.user as RequestUser;
    return this.leavesService.approve(id, user.email);
  }

  // ---------------------------------------------------------------------------
  // PATCH /leaves/:id/reject  (HR or Supervisor)
  // Moves Pending / Reviewed / Approved → Rejected.
  // If the leave was Approved, hours are restored to the balance automatically.
  // ---------------------------------------------------------------------------
  @Patch(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = req.user as RequestUser;
    return this.leavesService.reject(id, user.email);
  }

  // ---------------------------------------------------------------------------
  // PATCH /leaves/:id/cancel  (Staff self-service)
  // Staff can cancel their own Pending or Reviewed leave.
  // Approved leaves must be rejected by a supervisor/HR instead.
  // ---------------------------------------------------------------------------
  @Patch(':id/cancel')
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelLeaveDto,
    @Req() req: Request,
  ) {
    const user = req.user as RequestUser;
    return this.leavesService.cancel(id, user.email, dto.reason);
  }
}
