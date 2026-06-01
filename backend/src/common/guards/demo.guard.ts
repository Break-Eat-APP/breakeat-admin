import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * DemoGuard — blocks access to simulator/demo endpoints in non-demo environments.
 *
 * Usage:
 *   @UseGuards(DemoGuard)
 *   @Post('seed')
 *   async seed() { ... }
 *
 * Configuration:
 *   DEMO_MODE=true  → requests pass through
 *   DEMO_MODE=false (default) → 403 Forbidden
 *
 * Safety:  DEMO_MODE must NEVER be set to true in production
 * (enforced by main.ts startup guard — see appConfig.demoMode check).
 */
@Injectable()
export class DemoGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(_ctx: ExecutionContext): boolean {
    const isDemoMode = this.config.get<boolean>('app.demoMode') === true;
    if (!isDemoMode) {
      throw new ForbiddenException(
        'This endpoint is only available in DEMO_MODE. Set DEMO_MODE=true to enable.',
      );
    }
    return true;
  }
}
