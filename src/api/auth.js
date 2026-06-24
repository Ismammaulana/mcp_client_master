import { timingSafeEqual } from "node:crypto";
import { UnauthorizedError } from "../domain/errors.js";

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createAuthenticate(config) {
  return async function authenticate(request) {
    if (!config.apiKey) {
      return;
    }

    const rawHeader = request.headers["x-api-key"];
    const candidate = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (typeof candidate !== "string" || !safeEqual(candidate, config.apiKey)) {
      throw new UnauthorizedError();
    }
  };
}
