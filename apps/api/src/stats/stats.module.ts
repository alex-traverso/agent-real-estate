import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

/**
 * Read-only dashboard metrics for the admin panel. SupabaseService is global;
 * AuthModule is imported for SupabaseAuthGuard.
 */
@Module({
  imports: [AuthModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
