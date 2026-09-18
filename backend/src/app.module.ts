import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { VenuesModule } from './modules/venues/venues.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { EventsModule } from './modules/events/events.module';
import { PickupPointsModule } from './modules/pickup-points/pickup-points.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProductsModule } from './modules/products/products.module';
import { StockModule } from './modules/stock/stock.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CartModule } from './modules/cart/cart.module';
import { OrderSplitsModule } from './modules/order-splits/order-splits.module';
import { OrdersModule } from './modules/orders/orders.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { SlotsModule } from './modules/slots/slots.module';
import { FlaixModule } from './modules/flaix/flaix.module';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module';
import { AppSettingsModule } from './modules/app-settings/app-settings.module';
import { GroupsModule } from './modules/groups/groups.module';
import { BackofficeModule } from './modules/backoffice/backoffice.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { COMPTEURS } from './common/securite/limitation';
import { APP_GUARD } from '@nestjs/core';
import { StatsModule } from './modules/stats/stats.module';
import { ClientsModule } from './modules/clients/clients.module';
import { FrequentationModule } from './modules/frequentation/frequentation.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';
import { LiveActivityModule } from './modules/live-activity/live-activity.module';
import { BootstrapModule } from './modules/bootstrap/bootstrap.module';
import appConfig from './config/app.config';

@Module({
  imports: [
    // ConfigModule is global — every module can inject ConfigService without re-importing
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      expandVariables: true,
    }),
    // PrismaModule is global — PrismaService available everywhere
    PrismaModule,
    // Phase 18 — cron pour les pushs programmés / campagnes (C2/C3)
    ScheduleModule.forRoot(),
    HealthModule,
    // Phase 2
    UsersModule,
    AuthModule,
    OrganizationsModule,
    // Phase 3
    VenuesModule,
    SuppliersModule,
    EventsModule,
    PickupPointsModule,
    // Phase 4
    CategoriesModule,
    ProductsModule,
    StockModule,
    // Phase 5
    PaymentsModule,
    CartModule,
    OrderSplitsModule,
    OrdersModule,
    WebhooksModule,
    // Phase 6
    RealtimeModule,
    // Phase 7
    SlotsModule,
    FlaixModule,
    // Phase 9
    FeatureFlagsModule,
    AppSettingsModule,
    // Phase 14
    GroupsModule,
    BackofficeModule,
    // Phase 11 — Operator dashboard (configurable screens)
    // Phase 15 — Manager dashboard (org/event analytics)
    // Limitation de débit : deux compteurs, décrits et justifiés dans
    // `common/securite/limitation.ts`. Un large par IP, un serré par adresse
    // e-mail sur l'authentification — parce qu'un stade entier partage une IP.
    ThrottlerModule.forRoot(COMPTEURS),
    StatsModule,
    ClientsModule,
    FrequentationModule,
    // Phase 18 — Notifications push (fondation Expo : C1/C2/C3)
    NotificationsModule,
    LoyaltyModule,
    LiveActivityModule,
    BootstrapModule,
  ],
  // La limitation de débit s'applique à TOUTES les routes, sauf celles qui
  // portent `@SkipThrottle()` — les webhooks (Stripe réessaie, et l'étrangler
  // ferait perdre des commandes déjà payées) et le contrôle de santé, que
  // Railway interroge en continu.
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
