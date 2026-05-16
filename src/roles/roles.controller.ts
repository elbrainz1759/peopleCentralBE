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
import { RolesService } from './roles.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  // POST /roles
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  // GET /roles?page=1&limit=10&search=keyword
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.rolesService.findAll(query);
  }

  // GET /roles/unique/:uniqueId — must be before :id to avoid route clash
  @Get('unique/:uniqueId')
  findByUniqueId(@Param('uniqueId') uniqueId: string) {
    return this.rolesService.findByUniqueId(uniqueId);
  }

  // GET /roles/:id
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.findOne(id);
  }

  // PATCH /roles/:id
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  // DELETE /roles/:id
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.remove(id);
  }
}
