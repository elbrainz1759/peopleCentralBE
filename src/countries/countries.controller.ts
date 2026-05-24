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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CountriesService } from './countries.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { Public } from '../decorators/public.decorator';
import { RequestUser } from 'src/common/interfaces/request-user.interface';

@Controller('countries')
export class CountriesController {
  constructor(private readonly countriesService: CountriesService) {}

  // POST /countries
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCountryDto, @Req() req: Request) {
    const user = req.user as RequestUser;
    return this.countriesService.create(dto, user);
  }

  // GET /countries?page=1&limit=10&search=keyword
  @Public()
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.countriesService.findAll(query);
  }

  // GET /countries/unique/:uniqueId — must be before :id to avoid route clash
  @Get('unique/:uniqueId')
  findByUniqueId(@Param('uniqueId') uniqueId: string) {
    return this.countriesService.findByUniqueId(uniqueId);
  }

  // GET /countries/:id
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.countriesService.findOne(id);
  }

  // PATCH /countries/:id
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCountryDto) {
    return this.countriesService.update(id, dto);
  }

  // DELETE /countries/:id
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.countriesService.remove(id);
  }
}
