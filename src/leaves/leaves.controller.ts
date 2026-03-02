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
} from '@nestjs/common';
import { LeavesService } from './leaves.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';

@Controller('leaves')
export class LeavesController {
  constructor(private readonly leavesService: LeavesService) {}

  // POST /leaves
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateLeaveDto) {
    // TODO: replace 'system' with req.user.username from your auth guard
    return this.leavesService.create(dto, 'system');
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
    return this.leavesService.review(id, 'system');
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
