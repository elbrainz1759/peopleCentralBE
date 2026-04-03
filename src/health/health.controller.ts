// src/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Public() // skip JWT guard
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
