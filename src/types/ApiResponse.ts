/**
 * Estructura estándar para todas las respuestas de la API
 * @see API_RESPONSE_STANDARD.md para documentación completa
 */

/**
 * Error detallado de la API
 */
export interface ApiError {
  message: string
  code?: ErrorCode
  details?: unknown
}

/**
 * Metadatos opcionales de la respuesta
 */
export interface ApiMeta {
  timestamp?: string
  requestId?: string
}

/**
 * Estructura base de respuesta de la API
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: ApiError
  meta?: ApiMeta
}

/**
 * Códigos de error estándar
 */
export enum ErrorCode {
  // Errores HTTP estándar
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  UNPROCESSABLE_ENTITY = 'UNPROCESSABLE_ENTITY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // Errores personalizados de negocio
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  ACCOUNT_INACTIVE = 'ACCOUNT_INACTIVE',
  INVALID_TOKEN = 'INVALID_TOKEN',
  PASSWORD_MISMATCH = 'PASSWORD_MISMATCH',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  INVALID_EXCHANGE_RATE = 'INVALID_EXCHANGE_RATE',
}

/**
 * Campo de validación con error
 */
export interface ValidationField {
  field: string
  message: string
}

/**
 * Detalles de error de validación
 */
export interface ValidationErrorDetails {
  fields: ValidationField[]
}

/**
 * Detalles de error de recurso no encontrado
 */
export interface NotFoundErrorDetails {
  resource?: string
  id?: number | string
}

/**
 * Detalles de error de rate limit
 */
export interface RateLimitErrorDetails {
  retryAfter: number
}
