function hasPythonTruthyStructuredContent(value) {
  if (value === null || value === undefined || value === false || value === 0) {
    return false;
  }
  if (typeof value === "string" || Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return true;
}

export function parseCallToolResult(result) {
  if (hasPythonTruthyStructuredContent(result?.structuredContent)) {
    return {
      ok: !result?.isError,
      mode: "structured",
      data: result.structuredContent,
    };
  }

  const texts = Array.isArray(result?.content)
    ? result.content
        .filter((item) => item?.type === "text" && typeof item.text === "string")
        .map((item) => item.text)
    : [];

  return {
    ok: !result?.isError,
    mode: "text",
    data: { texts },
  };
}
