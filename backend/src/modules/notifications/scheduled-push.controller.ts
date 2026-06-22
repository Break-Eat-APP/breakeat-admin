import { Body, Controller, Delete, Get, Param, Post, ParseUUIDPipe, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsIn, IsInt, Min, Max, IsISO8601, IsUUID } from 'class-validator';
import { ScheduledPushService } from './scheduled-push.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

class CreateScheduledPushDto {
  @IsUUID()
  @IsOptional()
  eventId?: string;

  @IsIn(['PUSH', 'DISCOUNT_CAMPAIGN'])
  @IsOptional()
  kind?: 'PUSH' | 'DISCOUNT_CAMPAIGN';

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  body?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  discountPercent?: number;

  @IsISO8601()
  scheduledAt!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('organizations/:orgId/scheduled-pushes')
export class ScheduledPushController {
  constructor(private readonly service: ScheduledPushService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateScheduledPushDto,
  ) {
    return this.service.create(orgId, user.sub, dto);
  }

  @Get()
  list(@Param('orgId', ParseUUIDPipe) orgId: string, @CurrentUser() user: JwtPayload) {
    return this.service.list(orgId, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.cancel(orgId, id, user.sub);
  }
}
