import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ProgramsService } from './programs.service';
import {
  CreateProgramDto,
  UpdateProgramDto,
  PaginationQueryDto,
} from './dto/program.dto';
import { Public } from '../decorators/public.decorator';
import { RequestUser } from 'src/common/interfaces/request-user.interface';
import type { Request } from 'express';

@Controller('programs')
export class ProgramsController {
  constructor(private readonly programsService: ProgramsService) {}

  // POST /programs
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateProgramDto, @Req() req: Request) {
    const user = req.user as RequestUser;
    return this.programsService.create(dto, user);
  }

  // GET /programs?page=1&limit=10&search=keyword
  @Public()
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
  findOne(@Param('id') id: string) {
    return this.programsService.findOne(id);
  }

  // PATCH /programs/:id
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProgramDto) {
    return this.programsService.update(id, dto);
  }

  // DELETE /programs/:id
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.programsService.remove(id);
  }
}
