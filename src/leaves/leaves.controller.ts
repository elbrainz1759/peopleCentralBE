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
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LeavesService } from './leaves.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { CancelLeaveDto } from './dto/cancel-leave.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { RequestUser } from 'src/common/interfaces/request-user.interface';
import type { Request } from 'express';
import multer from 'multer';

@Controller('leaves')
export class LeavesController {
  constructor(private readonly leavesService: LeavesService) {}

  // ---------------------------------------------------------------------------
  // POST /leaves
  // Multipart form-data: JSON fields + optional `document` PDF file.
  // ---------------------------------------------------------------------------
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('document', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(
            new BadRequestException('Only PDF files are accepted'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  create(
    @Body() dto: CreateLeaveDto,
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const user = req.user as RequestUser;
    return this.leavesService.create(dto, user, file);
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
  // ---------------------------------------------------------------------------
  @Get(':id/cancellation')
  findCancellation(@Param('id', ParseIntPipe) id: number) {
    return this.leavesService.findCancellation(id);
  }

  // ---------------------------------------------------------------------------
  // PATCH /leaves/:id/review  (HR)
  // ---------------------------------------------------------------------------
  @Patch(':id/review')
  review(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = req.user as RequestUser;
    return this.leavesService.review(id, user.email);
  }

  // ---------------------------------------------------------------------------
  // PATCH /leaves/:id/approve  (Supervisor)
  // ---------------------------------------------------------------------------
  @Patch(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = req.user as RequestUser;
    return this.leavesService.approve(id, user.email);
  }

  // ---------------------------------------------------------------------------
  // PATCH /leaves/:id/reject  (HR or Supervisor)
  // ---------------------------------------------------------------------------
  @Patch(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = req.user as RequestUser;
    return this.leavesService.reject(id, user.email);
  }

  // ---------------------------------------------------------------------------
  // PATCH /leaves/:id/cancel  (Staff self-service)
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
