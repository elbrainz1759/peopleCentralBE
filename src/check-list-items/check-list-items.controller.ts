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
import { CheckListItemsService } from './check-list-items.service';
import { CreateCheckListItemDto } from './dto/create-check-list-item.dto';
import { UpdateCheckListItemDto } from './dto/update-check-list-item.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';

@Controller('check-list-items')
export class CheckListItemsController {
  constructor(private readonly checkListItemsService: CheckListItemsService) {}

  // POST /check-list-items
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCheckListItemDto) {
    return this.checkListItemsService.create(dto);
  }

  // GET /check-list-items?page=1&limit=10&search=keyword
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.checkListItemsService.findAll(query);
  }

  // GET /check-list-items/unique/:uniqueId — must be before :id to avoid route clash
  @Get('unique/:uniqueId')
  findByUniqueId(@Param('uniqueId') uniqueId: string) {
    return this.checkListItemsService.findByUniqueId(uniqueId);
  }

  // GET /check-list-items/:id
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.checkListItemsService.findOne(id);
  }

  // PATCH /check-list-items/:id
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCheckListItemDto,
  ) {
    return this.checkListItemsService.update(id, dto);
  }

  // DELETE /check-list-items/:id
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.checkListItemsService.remove(id);
  }
}
