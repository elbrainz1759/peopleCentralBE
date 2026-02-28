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
import { CountriesService } from './countries.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';

@Controller('countries')
export class CountriesController {
  constructor(private readonly countriesService: CountriesService) {}

  // POST /countries
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCountryDto) {
    return this.countriesService.create(dto);
  }

  // GET /countries?page=1&limit=10&search=keyword
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
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.countriesService.remove(id);
  }
}
