import { Module } from '@nestjs/common';
import { EmployeeController } from './employees.controller';
import { EmployeeService } from './employees.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [EmployeeController],
  providers: [EmployeeService],
  exports: [EmployeeService],
})
export class EmployeeModule {}
