import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody is required by WebhookSignatureGuard: Meta's X-Hub-Signature-256
  // is an HMAC over the exact request bytes, not the parsed JSON.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // Validates every class-validator DTO (admin panel routes). Plain interface
  // bodies (e.g. the WhatsApp webhook payload) carry no validation metadata,
  // so this has no effect on them.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
