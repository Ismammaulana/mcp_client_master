import { describe, expect, it, vi } from "vitest";
import { createAuthenticate } from "../../src/api/auth.js";

describe("createAuthenticate", () => {
  it("logs failed API key authentication without exposing the candidate value", async () => {
    const authenticate = createAuthenticate({ apiKey: "expected-secret" });
    const request = {
      id: "req-1",
      method: "GET",
      url: "/tools",
      headers: { "x-api-key": "wrong-secret" },
      log: { warn: vi.fn() },
    };

    await expect(authenticate(request)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(request.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        method: "GET",
      }),
      "Request authentication failed",
    );
    expect(JSON.stringify(request.log.warn.mock.calls)).not.toContain(
      "wrong-secret",
    );
  });
});
