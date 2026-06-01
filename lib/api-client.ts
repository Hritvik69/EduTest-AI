export type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: number; details?: unknown };

export function unwrapApiData<T>(payload: T | ApiEnvelope<T>): T {
  if (isApiEnvelope<T>(payload)) {
    if (payload.success) return payload.data;
    throw new Error(payload.error);
  }

  return payload as T;
}

export async function fetchApiData<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallback = "Request failed.",
) {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new Error(`${fallback} Network connection failed. Please retry.`);
  }
  const payload = await readApiJson(response, fallback);

  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, fallback));
  }

  return unwrapApiData<T>(payload);
}

export async function readApiJson(response: Response, fallback: string) {
  try {
    return await response.json();
  } catch {
    return {
      success: false,
      error: response.ok
        ? `${fallback} Empty response received. Please retry.`
        : `${fallback} HTTP ${response.status}. Please retry.`,
      code: response.status,
    };
  }
}

export function apiErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    const error = (payload as { error: string }).error;
    if (/^Invalid request payload:/i.test(error) || /^Too many .* Limit is/i.test(error)) {
      return error;
    }
    const detail = payloadDetailsMessage(payload);
    return detail && !error.includes(detail) ? `${error} ${detail}` : error;
  }

  return fallback;
}

function isApiEnvelope<T>(payload: unknown): payload is ApiEnvelope<T> {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as { success?: unknown };
  return (
    "success" in record &&
    typeof record.success === "boolean"
  );
}

function payloadDetailsMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("details" in payload)) {
    return "";
  }

  const details = (payload as { details?: unknown }).details;
  if (!details || typeof details !== "object") return "";

  const issues = (details as { issues?: unknown }).issues;
  if (Array.isArray(issues)) {
    const messages = issues
      .map((issue) => {
        if (!issue || typeof issue !== "object") return "";
        const record = issue as { path?: unknown; message?: unknown };
        const path = typeof record.path === "string" ? record.path : "request";
        const message = typeof record.message === "string" ? record.message : "";
        return message ? `${path}: ${message}` : "";
      })
      .filter(Boolean)
      .slice(0, 3);

    return messages.length ? `Details: ${messages.join("; ")}.` : "";
  }

  const retryAfterSeconds = (details as { retryAfterSeconds?: unknown })
    .retryAfterSeconds;
  if (typeof retryAfterSeconds === "number" && retryAfterSeconds > 0) {
    return `Retry after ${Math.ceil(retryAfterSeconds)} second${
      Math.ceil(retryAfterSeconds) === 1 ? "" : "s"
    }.`;
  }

  return "";
}
