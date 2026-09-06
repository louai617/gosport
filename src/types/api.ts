/** Envelope every SportGo API route returns. */

export interface ApiMeta {
  /** Always present so clients can distinguish demo from live responses. */
  mode: "demo" | "live";
  requestId: string;
  generatedAt: string;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta: ApiMeta;
}

export interface ApiFieldError {
  field: string;
  /** i18n key for the message. */
  messageKey: string;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: ApiErrorCode;
    /** i18n key — never a raw server message. */
    messageKey: string;
    fields?: ApiFieldError[];
  };
  meta: ApiMeta;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type ApiErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "demo_mode_blocked"
  | "compliance_blocked"
  | "internal_error";

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  direction?: "asc" | "desc";
}
