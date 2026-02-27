import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProgramsService } from './programs.service';
import {
  CreateProgramDto,
  UpdateProgramDto,
  PaginationQueryDto,
} from './dto/program.dto';

@Controller('programs')
export class ProgramsController {
  constructor(private readonly programsService: ProgramsService) {}

  // POST /programs
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateProgramDto) {
    return this.programsService.create(dto);
  }

  // GET /programs?page=1&limit=10&search=keyword
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.programsService.findAll(query);
  }

  // GET /programs/unique/:uniqueId  — must be declared BEFORE :id to avoid route clash
  @Get('unique/:uniqueId')
  findByUniqueId(@Param('uniqueId') uniqueId: string) {
    return this.programsService.findByUniqueId(uniqueId);
  }

  // GET /programs/:id
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.programsService.findOne(id);
  }

  // PATCH /programs/:id
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProgramDto) {
    return this.programsService.update(id, dto);
  }

  // DELETE /programs/:id
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.programsService.remove(id);
  }
}
