import { Module } from '@nestjs/common';
import mysql from 'mysql2/promise';

@Module({
  providers: [
    {
      provide: 'MYSQL_POOL',
      useFactory: () => {
        return mysql.createPool({
          host: process.env.DB_HOST,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_NAME,
          connectionLimit: 10,
        });
      },
    },
  ],
  exports: ['MYSQL_POOL'],
})
export class DatabaseModule {}
