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
import { DashboardModule } from './dashboard/dashboard.module';
import { ExitModule } from './exit/exit.module';
import { CountriesModule } from './countries/countries.module';
import { LeaveTypesModule } from './leave-types/leave-types.module';
import { LocationsModule } from './locations/locations.module';
import { DepartmentsModule } from './departments/departments.module';
import { ProgramsModule } from './programs/programs.module';
import { LeavesModule } from './leaves/leaves.module';
import { LeaveBalancesController } from './leave-balances/leave-balances.controller';
import { LeaveBalancesModule } from './leave-balances/leave-balances.module';
import { CheckListItemsModule } from './check-list-items/check-list-items.module';
import { ExitInterviewModule } from './exit-interviews/exit-interviews.module';
import { DataTrackerModule } from './data-tracker/data-tracker.module';
import { PrometheusModule } from '@willsoto/nestjs-prometheus'; // 👈 ADD THIS
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true, // auto-collects Node.js memory, CPU, event loop lag
      },
      path: '/metrics', // Grafana Alloy will scrape GET /metrics
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    EmployeeModule,
    DashboardModule,
    ExitModule,
    CountriesModule,
    LeaveTypesModule,
    LocationsModule,
    DepartmentsModule,
    ProgramsModule,
    LeavesModule,
    LeaveBalancesModule,
    CheckListItemsModule,
    ExitInterviewModule,
    DataTrackerModule,
  ],
  controllers: [AppController, LeaveBalancesController, HealthController],
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
