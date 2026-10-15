import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports: [TrackingModule],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
