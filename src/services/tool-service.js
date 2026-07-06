import { ToolNotAllowedError } from "../domain/errors.js";
import { parseCallToolResult } from "../domain/result-parser.js";

const ACTIVATION_PAGE = "aktivasi-service";
const ADD_DEVICE_TOOL_ALIAS = "activation.add_device_to_topology";
const LEGACY_ADD_DEVICE_TOOL = "topology.add_device";
const CONFIGURE_DEVICE_TOOL = "activation.configure_device";
const ACTIVATION_PLAN_TOOLS = new Set([
  "activation.get_workspace_context",
  "activation.create_draft",
  "device.search",
  ADD_DEVICE_TOOL_ALIAS,
  LEGACY_ADD_DEVICE_TOOL,
  CONFIGURE_DEVICE_TOOL,
  "activation.validate_draft",
  "activation.verify_schema",
]);
const REQUIRED_PLAN_ARGUMENTS = new Map([
  ["activation.get_workspace_context", ["workspace_id"]],
  ["activation.create_draft", ["workspace_id", "service_type", "draft_name"]],
  ["device.search", ["workspace_id", "query"]],
  [ADD_DEVICE_TOOL_ALIAS, ["workspace_id", "device_id", "role", "position"]],
  [LEGACY_ADD_DEVICE_TOOL, ["workspace_id", "device_id", "role", "position"]],
  [CONFIGURE_DEVICE_TOOL, ["workspace_id", "config"]],
  ["activation.validate_draft", ["workspace_id"]],
  ["activation.verify_schema", ["workspace_id"]],
]);
const ACTIVATION_ARGUMENT_ALIASES = new Map([
  ["workspaceId", "workspace_id"],
  ["sessionId", "session_id"],
  ["draftId", "draft_id"],
  ["serviceType", "service_type"],
  ["draftName", "draft_name"],
  ["deviceId", "device_id"],
  ["tabId", "tab_id"],
  ["requestId", "request_id"],
  ["topologyId", "topology_id"],
  ["parentDeviceId", "parent_device_id"],
]);

function setNestedResult(target, toolName, value) {
  const segments = toolName.split(".");
  let cursor = target;

  for (const segment of segments.slice(0, -1)) {
    if (
      !Object.hasOwn(cursor, segment) ||
      cursor[segment] === null ||
      typeof cursor[segment] !== "object" ||
      Array.isArray(cursor[segment])
    ) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }

  cursor[segments.at(-1)] = value;
}

function tokenizePlaceholderPath(path) {
  return path.match(/[^.[\]]+|\[\d+\]/g) ?? [];
}

function normalizeStepError(error) {
  if (error instanceof ToolNotAllowedError) {
    return {
      code: error.code,
      message: error.message,
      fatal: true,
    };
  }

  if (error instanceof Error && "code" in error && "message" in error) {
    return {
      code: error.code,
      message: error.message,
      fatal: true,
    };
  }

  return {
    code: "PLAN_STEP_FAILED",
    message: "Plan step failed unexpectedly",
    fatal: true,
  };
}

function createPlaceholderError(placeholder) {
  const error = new Error(`Unable to resolve placeholder '${placeholder}'`);
  error.code = "PLACEHOLDER_RESOLUTION_FAILED";
  return error;
}

function createPlanInputError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function resolvePlaceholderValue(placeholder, resultsByTool) {
  const path = placeholder.slice("result:".length);
  const tokens = tokenizePlaceholderPath(path);
  let cursor = resultsByTool;

  for (const token of tokens) {
    const key = token.startsWith("[") ? Number(token.slice(1, -1)) : token;
    if (
      cursor === null ||
      cursor === undefined ||
      !Object.hasOwn(cursor, key)
    ) {
      throw createPlaceholderError(placeholder);
    }
    cursor = cursor[key];
  }

  return cursor;
}

function resolveArgumentPlaceholders(value, resultsByTool) {
  if (typeof value === "string" && value.startsWith("result:")) {
    return resolvePlaceholderValue(value, resultsByTool);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveArgumentPlaceholders(item, resultsByTool));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveArgumentPlaceholders(item, resultsByTool),
      ]),
    );
  }

  return value;
}

function createStepResult(toolName, args, result) {
  return {
    tool: toolName,
    arguments: args,
    content: result?.content ?? null,
    structured_content: result?.structuredContent ?? null,
    parsed_result: parseCallToolResult(result),
  };
}

function resolveExecutionToolName(toolName, allowedTools) {
  if (toolName === ADD_DEVICE_TOOL_ALIAS && allowedTools.has(ADD_DEVICE_TOOL_ALIAS)) {
    return ADD_DEVICE_TOOL_ALIAS;
  }
  if (toolName === ADD_DEVICE_TOOL_ALIAS && allowedTools.has(LEGACY_ADD_DEVICE_TOOL)) {
    return LEGACY_ADD_DEVICE_TOOL;
  }
  return toolName;
}

function isActivationPlanContext(plan, toolName) {
  return plan.page === ACTIVATION_PAGE && ACTIVATION_PLAN_TOOLS.has(toolName);
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return true;
}

function readPathValue(source, path) {
  let cursor = source;
  for (const segment of path) {
    if (
      cursor === null ||
      cursor === undefined ||
      typeof cursor !== "object" ||
      !Object.hasOwn(cursor, segment)
    ) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function resolveDraftIdFromResults(resultsByTool) {
  const candidates = [
    ["activation", "create_draft", "draftId"],
    ["activation", "create_draft", "draft_id"],
    ["activation", "create_draft", "draft", "id"],
    ["activation", "get_workspace_context", "draftId"],
    ["activation", "get_workspace_context", "draft_id"],
    ["activation", "get_workspace_context", "draft", "id"],
    ["activation", "get_workspace_context", "context", "draftId"],
    ["activation", "get_workspace_context", "context", "draft_id"],
    ["activation", "get_workspace_context", "workspace", "draftId"],
    ["activation", "get_workspace_context", "workspace", "draft_id"],
  ];

  for (const path of candidates) {
    const value = readPathValue(resultsByTool, path);
    if (hasMeaningfulValue(value)) {
      return value;
    }
  }

  return undefined;
}

function coerceIdentifierValue(value) {
  return typeof value === "number" || typeof value === "bigint"
    ? String(value)
    : value;
}

function coerceIdentifierFields(target) {
  for (const field of [
    "workspace_id",
    "draft_id",
    "device_id",
    "session_id",
    "tab_id",
    "request_id",
    "topology_id",
    "parent_device_id",
  ]) {
    if (hasMeaningfulValue(target[field])) {
      target[field] = coerceIdentifierValue(target[field]);
    }
  }
}

function createCompatibilityDraftId(workspaceId, serviceType) {
  return `draft-${workspaceId}-${serviceType}`;
}

function decorateCreateDraftResult(resultValue, normalizedArguments, plan) {
  const candidateDraftId = readPathValue(resultValue, ["draftId"]);
  if (hasMeaningfulValue(candidateDraftId)) {
    return resultValue;
  }

  const workspaceId =
    normalizedArguments.workspace_id ?? plan.workspaceId ?? "workspace";
  const serviceType = normalizedArguments.service_type ?? "service";
  const syntheticDraftId = createCompatibilityDraftId(workspaceId, serviceType);
  return {
    ...(resultValue ?? {}),
    draftId: syntheticDraftId,
    draft_id: syntheticDraftId,
    id: syntheticDraftId,
  };
}

function createDefaultDraftName(serviceType, now = new Date()) {
  return `Draft ${serviceType} ${now.toISOString()}`;
}

function logServiceEvent(logger, level, message, details = {}) {
  const method = logger?.[level];
  if (typeof method !== "function") {
    return;
  }
  method.call(logger, details, message);
}

function normalizePlanArguments(plan, step, resolvedArguments, resultsByTool) {
  if (!isActivationPlanContext(plan, step.tool)) {
    return resolvedArguments;
  }

  const normalizedArguments = { ...resolvedArguments };
  for (const [sourceKey, targetKey] of ACTIVATION_ARGUMENT_ALIASES.entries()) {
    if (
      !hasMeaningfulValue(normalizedArguments[targetKey]) &&
      hasMeaningfulValue(normalizedArguments[sourceKey])
    ) {
      normalizedArguments[targetKey] = normalizedArguments[sourceKey];
    }
  }
  const workspaceId =
    normalizedArguments.workspace_id ??
    normalizedArguments.workspaceId ??
    plan.workspaceId;
  const tabId = normalizedArguments.tab_id ?? plan.tabId;

  if (!hasMeaningfulValue(normalizedArguments.workspace_id) && hasMeaningfulValue(workspaceId)) {
    normalizedArguments.workspace_id = workspaceId;
  }

  if (!hasMeaningfulValue(normalizedArguments.tab_id) && hasMeaningfulValue(tabId)) {
    normalizedArguments.tab_id = tabId;
  }

  if (
    step.tool === "activation.create_draft" &&
    !hasMeaningfulValue(normalizedArguments.draft_name) &&
    hasMeaningfulValue(normalizedArguments.service_type)
  ) {
    normalizedArguments.draft_name = createDefaultDraftName(
      normalizedArguments.service_type,
    );
  }

  if (
    (step.tool === ADD_DEVICE_TOOL_ALIAS ||
      step.tool === LEGACY_ADD_DEVICE_TOOL ||
      step.tool === CONFIGURE_DEVICE_TOOL ||
      step.tool === "activation.validate_draft" ||
      step.tool === "activation.verify_schema") &&
    !hasMeaningfulValue(normalizedArguments.draft_id)
  ) {
    const draftId = resolveDraftIdFromResults(resultsByTool);
    if (hasMeaningfulValue(draftId)) {
      normalizedArguments.draft_id = draftId;
    }
  }

  coerceIdentifierFields(normalizedArguments);

  return normalizedArguments;
}

function validatePlanArguments(plan, toolName, args) {
  if (!isActivationPlanContext(plan, toolName)) {
    return;
  }

  const requiredArguments = REQUIRED_PLAN_ARGUMENTS.get(toolName) ?? [];
  const missingArguments = requiredArguments.filter(
    (field) => !hasMeaningfulValue(args[field]),
  );

  if (missingArguments.length === 0) {
    return;
  }

  throw createPlanInputError(
    "PLAN_ARGUMENTS_INVALID",
    `Step '${toolName}' on page '${plan.page}' is missing required arguments after normalization: ${missingArguments.join(", ")}`,
  );
}

export class ToolService {
  constructor(mcpClient, allowedTools, { logger } = {}) {
    this.mcpClient = mcpClient;
    this.allowedTools = allowedTools;
    this.logger = logger;
  }

  async listTools() {
    logServiceEvent(this.logger, "debug", "ToolService.listTools started");
    const response = await this.mcpClient.listTools();
    const tools = response.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? null,
      inputSchema: tool.inputSchema ?? null,
    }));
    logServiceEvent(this.logger, "debug", "ToolService.listTools completed", {
      toolCount: tools.length,
    });
    return tools;
  }

  async callTool(name, args = {}) {
    logServiceEvent(this.logger, "debug", "ToolService.callTool started", {
      toolName: name,
      argumentKeys: Object.keys(args),
    });
    this.assertAllowed(name);
    const result = await this.mcpClient.callTool(name, args);
    logServiceEvent(this.logger, "debug", "ToolService.callTool completed", {
      toolName: name,
      isError: Boolean(result?.isError),
    });
    return result;
  }

  async discoverServer() {
    logServiceEvent(this.logger, "debug", "ToolService.discoverServer started");
    const discovery = await this.mcpClient.discoverServer();
    const normalizedDiscovery = {
      ...discovery,
      tools: discovery.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? null,
        inputSchema: tool.inputSchema ?? null,
      })),
      prompts: discovery.prompts.map((prompt) => ({
        name: prompt.name,
        description: prompt.description ?? null,
        arguments: prompt.arguments ?? [],
      })),
      resources: discovery.resources.map((resource) => ({
        name: resource.name ?? null,
        uri: resource.uri,
        description: resource.description ?? null,
        mimeType: resource.mimeType ?? null,
      })),
    };
    logServiceEvent(this.logger, "debug", "ToolService.discoverServer completed", {
      toolCount: normalizedDiscovery.tools.length,
      promptCount: normalizedDiscovery.prompts.length,
      resourceCount: normalizedDiscovery.resources.length,
      transportMode: normalizedDiscovery.transport?.mode ?? null,
    });
    return normalizedDiscovery;
  }

  async listPrompts() {
    logServiceEvent(this.logger, "debug", "ToolService.listPrompts started");
    const response = await this.mcpClient.listPrompts();
    const prompts = response.prompts.map((prompt) => ({
      name: prompt.name,
      description: prompt.description ?? null,
      arguments: prompt.arguments ?? [],
    }));
    logServiceEvent(this.logger, "debug", "ToolService.listPrompts completed", {
      promptCount: prompts.length,
    });
    return prompts;
  }

  async getPrompt(name, args = {}) {
    logServiceEvent(this.logger, "debug", "ToolService.getPrompt started", {
      promptName: name,
      argumentKeys: Object.keys(args),
    });
    const prompt = await this.mcpClient.getPrompt(name, args);
    logServiceEvent(this.logger, "debug", "ToolService.getPrompt completed", {
      promptName: name,
      messageCount: prompt?.messages?.length ?? 0,
    });
    return prompt;
  }

  async listResources() {
    logServiceEvent(this.logger, "debug", "ToolService.listResources started");
    const response = await this.mcpClient.listResources();
    const resources = response.resources.map((resource) => ({
      name: resource.name ?? null,
      uri: resource.uri,
      description: resource.description ?? null,
      mimeType: resource.mimeType ?? null,
    }));
    logServiceEvent(this.logger, "debug", "ToolService.listResources completed", {
      resourceCount: resources.length,
    });
    return resources;
  }

  async readResource(uri) {
    logServiceEvent(this.logger, "debug", "ToolService.readResource started", {
      uri,
    });
    const resource = await this.mcpClient.readResource(uri);
    logServiceEvent(this.logger, "debug", "ToolService.readResource completed", {
      uri,
      hasResource: resource !== null,
    });
    return resource;
  }

  async simulatePath(source, destination) {
    logServiceEvent(this.logger, "debug", "ToolService.simulatePath started", {
      source,
      destination,
    });
    const result = await this.callTool("simulate_router_path", {
      source,
      destination,
    });
    logServiceEvent(this.logger, "debug", "ToolService.simulatePath completed");
    return parseCallToolResult(result);
  }

  async executePlan(plan, context = {}) {
    logServiceEvent(this.logger, "debug", "ToolService.executePlan started", {
      requestId: context.requestId ?? null,
      planId: plan.planId,
      sessionId: plan.sessionId ?? null,
      page: plan.page ?? null,
      stepCount: plan.steps.length,
    });
    const steps = [];
    const resultsByTool = {};

    for (const [index, step] of plan.steps.entries()) {
      let finalArguments = step.arguments ?? {};
      const executionTool = resolveExecutionToolName(step.tool, this.allowedTools);
      const stepAudit = {
        requestId: context.requestId ?? null,
        planId: plan.planId,
        sessionId: plan.sessionId,
        page: plan.page,
        stepIndex: index,
        stepId: step.id ?? null,
        tool: step.tool,
        executionTool,
      };
      const startedAt = Date.now();

      this.logger?.info(stepAudit, "Plan step execution started");

      try {
        this.assertAllowed(step.tool);
        const resolvedArguments = resolveArgumentPlaceholders(
          step.arguments ?? {},
          resultsByTool,
        );
        const normalizedArguments = normalizePlanArguments(
          plan,
          step,
          resolvedArguments,
          resultsByTool,
        );
        finalArguments = normalizedArguments;
        validatePlanArguments(plan, step.tool, normalizedArguments);
        this.logger?.info(
          {
            ...stepAudit,
            normalizedArguments,
          },
          "Plan step arguments normalized",
        );
        const result = await this.mcpClient.callTool(
          executionTool,
          normalizedArguments,
        );
        const stepResult = createStepResult(step.tool, normalizedArguments, result);
        const status = result?.isError ? "failed" : "success";

        steps.push({
          id: step.id ?? null,
          tool: step.tool,
          status,
          result: result?.isError
            ? {
                ...stepResult,
                error: {
                  code: "MCP_TOOL_ERROR",
                  message: `MCP tool '${step.tool}' returned isError=true`,
                  fatal: true,
                },
              }
            : stepResult,
        });

        if (result?.isError) {
          this.logger?.warn(
            {
              ...stepAudit,
              durationMs: Date.now() - startedAt,
              status,
            },
            "Plan step execution failed",
          );
          this.#appendSkippedSteps(steps, plan.steps, index + 1);
          logServiceEvent(this.logger, "debug", "ToolService.executePlan completed", {
            requestId: context.requestId ?? null,
            planId: plan.planId,
            status: "failed",
            stepCount: steps.length,
          });
          return {
            planId: plan.planId,
            status: "failed",
            steps,
            summary: {
              message: `Plan stopped at step ${index + 1} because MCP tool '${step.tool}' returned isError=true`,
            },
          };
        }

        const storedResultValue =
          step.tool === "activation.create_draft"
            ? decorateCreateDraftResult(
                result?.structuredContent ?? parseCallToolResult(result).data,
                normalizedArguments,
                plan,
              )
            : result?.structuredContent ?? parseCallToolResult(result).data;
        setNestedResult(resultsByTool, step.tool, storedResultValue);

        this.logger?.info(
          {
            ...stepAudit,
            durationMs: Date.now() - startedAt,
            status,
          },
          "Plan step execution completed",
        );
      } catch (error) {
        const normalizedError = normalizeStepError(error);
        steps.push({
          id: step.id ?? null,
          tool: step.tool,
          status: "failed",
          result: {
            tool: step.tool,
            arguments: finalArguments,
            error: normalizedError,
          },
        });
        this.logger?.warn(
          {
            ...stepAudit,
            durationMs: Date.now() - startedAt,
            status: "failed",
            errorCode: normalizedError.code,
          },
          "Plan step execution failed",
        );
        this.#appendSkippedSteps(steps, plan.steps, index + 1);
        logServiceEvent(this.logger, "debug", "ToolService.executePlan completed", {
          requestId: context.requestId ?? null,
          planId: plan.planId,
          status: "failed",
          stepCount: steps.length,
        });
        return {
          planId: plan.planId,
          status: "failed",
          steps,
          summary: {
            message: `Plan stopped at step ${index + 1} because ${normalizedError.code}`,
          },
        };
      }
    }

    logServiceEvent(this.logger, "debug", "ToolService.executePlan completed", {
      requestId: context.requestId ?? null,
      planId: plan.planId,
      status: "success",
      stepCount: steps.length,
    });
    return {
      planId: plan.planId,
      status: "success",
      steps,
      summary: {
        message: `Plan executed ${steps.length} step(s) successfully`,
      },
    };
  }

  assertAllowed(name) {
    if (
      this.allowedTools.has(name) ||
      (name === ADD_DEVICE_TOOL_ALIAS &&
        this.allowedTools.has(LEGACY_ADD_DEVICE_TOOL))
    ) {
      return;
    }

    if (!this.allowedTools.has(name)) {
      logServiceEvent(this.logger, "warn", "ToolService allowlist rejected tool", {
        toolName: name,
      });
      throw new ToolNotAllowedError(name);
    }
  }

  #appendSkippedSteps(executedSteps, allSteps, startIndex) {
    for (const skippedStep of allSteps.slice(startIndex)) {
      executedSteps.push({
        id: skippedStep.id ?? null,
        tool: skippedStep.tool,
        status: "skipped",
        result: null,
      });
    }
  }
}
