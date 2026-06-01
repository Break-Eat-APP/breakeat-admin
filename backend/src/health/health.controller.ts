import { Controller, Get } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
  environment: string;
  version: string;
}

/**
 * Health endpoint — used by Docker, CI, load balancers and monitoring.
 * Must never require authentication.
 * Must respond in < 50ms.
 * Route: GET /health  (outside the /api/v1 prefix — see main.ts excludeGlobalPrefix)
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? 'development',
      version: process.env.npm_package_version ?? '0.1.0',
    };
  }
}
