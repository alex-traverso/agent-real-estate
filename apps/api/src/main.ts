import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody is required by WebhookSignatureGuard: Meta's X-Hub-Signature-256
  // is an HMAC over the exact request bytes, not the parsed JSON.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
