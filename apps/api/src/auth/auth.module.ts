import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { SupabaseUserGuard } from './supabase-user.guard';

@Module({
  providers: [SupabaseAuthGuard, SupabaseUserGuard],
  exports: [SupabaseAuthGuard, SupabaseUserGuard],
})
export class AuthModule {}
