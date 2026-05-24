import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { LeavesService } from './leaves.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { RequestUser } from 'src/common/interfaces/request-user.interface';
import type { Request } from 'express';

@Controller('leaves')
export class LeavesController {
  constructor(private readonly leavesService: LeavesService) {}

  // POST /leaves
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateLeaveDto, @Req() req: Request) {
    const user = req.user as RequestUser;
    return this.leavesService.create(dto, user);
  }

  // GET /leaves?page=1&limit=10&status=Pending&staffId=1
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.leavesService.findAll(query);
  }

  // GET /leaves/:id
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.leavesService.findOne(id);
  }

  // PATCH /leaves/:id/review  (HR marks as Reviewed)
  @Patch(':id/review')
  review(@Param('id', ParseIntPipe) id: number) {
    // TODO: replace 'system' with req.user.username from your auth guard
    return this.leavesService.review(id);
  }

  // PATCH /leaves/:id/approve  (Supervisor approves + balance deducted)
  @Patch(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number) {
    // TODO: replace 'system' with req.user.username from your auth guard
    return this.leavesService.approve(id, 'system');
  }

  // PATCH /leaves/:id/reject  (Reviewed or Approved → Rejected, balance restored if was Approved)
  @Patch(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number) {
    // TODO: replace 'system' with req.user.username from your auth guard
    return this.leavesService.reject(id, 'system');
  }
}
