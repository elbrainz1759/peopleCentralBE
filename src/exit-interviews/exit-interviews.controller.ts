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
  ExitInterview,
  PaginatedResult,
} from './exit-interviews.service';
import { CreateExitInterviewDto } from './dto/create-exit-interview.dto';
import { UpdateExitInterviewDto } from './dto/update-exit-interview.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';

@Controller('exit-interviews')
export class ExitInterviewController {
  constructor(private readonly exitInterviewService: ExitInterviewService) {}

  // POST /exit-interviews
  @Post()
  create(@Body() dto: CreateExitInterviewDto): Promise<ExitInterview> {
    return this.exitInterviewService.create(dto);
  }

  // GET /exit-interviews
  @Get()
  findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ExitInterview>> {
    return this.exitInterviewService.findAll(query);
  }

  // GET /exit-interviews/unique/:uniqueId
  @Get('unique/:uniqueId')
  findByUniqueId(@Param('uniqueId') uniqueId: string): Promise<ExitInterview> {
    return this.exitInterviewService.findByUniqueId(uniqueId);
  }

  // GET /exit-interviews/staff/:staffId
  @Get('staff/:staffId')
  findByStaffId(
    @Param('staffId', ParseIntPipe) staffId: number,
  ): Promise<ExitInterview[]> {
    return this.exitInterviewService.findByStaffId(staffId);
  }

  // GET /exit-interviews/:id
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<ExitInterview> {
    return this.exitInterviewService.findOne(id);
  }

  // PATCH /exit-interviews/:id
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExitInterviewDto,
  ): Promise<ExitInterview> {
    return this.exitInterviewService.update(id, dto);
  }

  // DELETE /exit-interviews/:id
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<{ message: string }> {
    return this.exitInterviewService.remove(id);
  }
}
