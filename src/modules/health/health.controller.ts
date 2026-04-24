import { Controller, Get } from '@nestjs/common';
import { Public } from '../../core/decorators/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  @Get('ping')
  ping() {
    return { pong: true };
  }
}
