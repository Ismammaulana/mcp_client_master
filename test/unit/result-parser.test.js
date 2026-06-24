import { describe, expect, it } from "vitest";
import { parseCallToolResult } from "../../src/domain/result-parser.js";

describe("parseCallToolResult", () => {
  it("uses non-empty structured content", () => {
    expect(
      parseCallToolResult({ structuredContent: { answer: 42 }, content: [] }),
    ).toEqual({ ok: true, mode: "structured", data: { answer: 42 } });
  });

  it("preserves legacy fallback for empty structured content", () => {
    expect(
      parseCallToolResult({
        structuredContent: {},
        content: [{ type: "text", text: "fallback" }],
      }),
    ).toEqual({ ok: true, mode: "text", data: { texts: ["fallback"] } });
  });

  it("extracts only text content", () => {
    const result = parseCallToolResult({
      content: [
        { type: "text", text: "first" },
        { type: "image", data: "ignored" },
        { type: "text", text: "second" },
      ],
    });
    expect(result.data.texts).toEqual(["first", "second"]);
  });

  it("marks a tool-level error without changing transport semantics", () => {
    expect(
      parseCallToolResult({ isError: true, content: [{ type: "text", text: "bad" }] }),
    ).toEqual({ ok: false, mode: "text", data: { texts: ["bad"] } });
  });

  it("handles empty and non-text content", () => {
    expect(parseCallToolResult({ content: [] })).toEqual({
      ok: true,
      mode: "text",
      data: { texts: [] },
    });
  });
});
