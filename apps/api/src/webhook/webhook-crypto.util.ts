import * as crypto from 'crypto';

/**
 * Constant-time string comparison. crypto.timingSafeEqual throws if the two
 * buffers differ in length, so a length check must gate it — a length
 * mismatch just means the strings are unequal. Shared by every webhook
 * control that compares a secret against caller-supplied input (signature,
 * verify token), so neither leaks timing information.
 */
export function constantTimeEqual(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
