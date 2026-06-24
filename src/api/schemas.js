export const pathRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["source", "destination"],
  properties: {
    source: { type: "string", minLength: 1 },
    destination: { type: "string", minLength: 1 },
  },
};

export const toolCallRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1 },
    arguments: { type: "object", default: {}, additionalProperties: true },
  },
};
