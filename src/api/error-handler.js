import { GatewayError } from "../domain/errors.js";

export function gatewayErrorHandler(error, request, reply) {
  if (error.statusCode === 413 || error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
    return reply.status(413).send({
      error: {
        code: "REQUEST_TOO_LARGE",
        message: "Request body exceeds the configured limit",
        request_id: request.id,
      },
    });
  }

  if (error.validation) {
    return reply.status(422).send({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        request_id: request.id,
      },
    });
  }

  if (error instanceof GatewayError) {
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        request_id: request.id,
      },
    });
  }

  request.log.error({ err: error }, "Unhandled gateway error");
  return reply.status(500).send({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      request_id: request.id,
    },
  });
}
