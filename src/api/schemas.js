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

export const planExecutionRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["planId", "sessionId", "page", "steps"],
  properties: {
    planId: { type: "string", minLength: 1 },
    sessionId: { type: "string", minLength: 1 },
    page: { type: "string", minLength: 1 },
    workspaceId: { type: "string", minLength: 1 },
    tabId: { type: "string", minLength: 1 },
    steps: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tool"],
        properties: {
          id: { type: "string", minLength: 1 },
          tool: { type: "string", minLength: 1 },
          arguments: { type: "object", default: {}, additionalProperties: true },
        },
      },
    },
  },
};

export const promptGetRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1 },
    arguments: { type: "object", default: {}, additionalProperties: true },
  },
};

export const resourceReadRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["uri"],
  properties: {
    uri: { type: "string", minLength: 1 },
  },
};
