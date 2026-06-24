import { describe, expect, it } from "vitest";
import { ConcurrencyLimitError } from "../../src/domain/errors.js";
import { ConcurrencyGate } from "../../src/infrastructure/concurrency-gate.js";

describe("ConcurrencyGate", () => {
  it("rejects work beyond the configured limit", async () => {
    let release;
    const blocked = new Promise((resolve) => {
      release = resolve;
    });
    const gate = new ConcurrencyGate(1);
    const first = gate.run(() => blocked);
    await expect(gate.run(async () => "second")).rejects.toBeInstanceOf(
      ConcurrencyLimitError,
    );
    release("first");
    await expect(first).resolves.toBe("first");
  });
});
