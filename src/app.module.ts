import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwtAuth.guard';
import { RolesGuard } from './auth/roles.guard';
import { UsersModule } from './users/users.module';
import { EmployeeModule } from './employees/employees.module';
import { LeaveModule } from './leave/leave.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExitModule } from './exit/exit.module';
import { CountriesModule } from './countries/countries.module';
import { LeaveTypesModule } from './leave-types/leave-types.module';
import { LocationsModule } from './locations/locations.module';
import { DepartmentsModule } from './departments/departments.module';
import { ProgramsModule } from './programs/programs.module';
@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    EmployeeModule,
    LeaveModule,
    DashboardModule,
    ExitModule,
    CountriesModule,
    LeaveTypesModule,
    LocationsModule,
    DepartmentsModule,
    ProgramsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
