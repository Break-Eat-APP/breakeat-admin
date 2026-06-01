import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { OrdersModule } from './modules/orders/orders.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
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
    OrdersModule,
    WebhooksModule,
    // Phase 6
    RealtimeModule,
  ],
})
export class AppModule {}
