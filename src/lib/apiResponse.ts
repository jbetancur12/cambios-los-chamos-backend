/**
 * Funciones helper para generar respuestas API consistentes
 * @see API_RESPONSE_STANDARD.md para documentación completa
 */

import {
  ApiResponse as ApiResponseType,
  ErrorCode,
  ValidationField,
  ValidationErrorDetails,
  NotFoundErrorDetails,
  RateLimitErrorDetails,
} from '@/types/ApiResponse'

/**
 * Genera una respuesta exitosa
 */
export function success<T = any>(data: T, meta?: { timestamp?: string; requestId?: string }): ApiResponseType<T> {
  return {
    success: true,
    data,
    ...(meta && { meta }),
  }
}

/**
 * Genera una respuesta de error genérica
 */
export function error(message: string, code?: ErrorCode, details?: any): ApiResponseType {
  return {
    success: false,
    error: {
      message,
      ...(code && { code }),
      ...(details && { details }),
    },
  }
}

/**
 * Error de validación (400)
 */
export function validationError(fields: ValidationField[]): ApiResponseType {
  return {
    success: false,
    error: {
      message: 'Datos de entrada inválidos',
      code: ErrorCode.VALIDATION_ERROR,
      details: {
        fields,
      } as ValidationErrorDetails,
    },
  }
}

/**
 * Error de validación simple con un solo campo
 */
export function validationErrorSingle(field: string, message: string): ApiResponseType {
  return validationError([{ field, message }])
}

/**
 * Error de solicitud incorrecta (400)
 */
export function badRequest(message: string, details?: any): ApiResponseType {
  return error(message, ErrorCode.BAD_REQUEST, details)
}

/**
 * Error de no autenticado (401)
 */
export function unauthorized(message: string = 'No autenticado'): ApiResponseType {
  return error(message, ErrorCode.UNAUTHORIZED)
}

/**
 * Error de no autorizado / sin permisos (403)
 */
export function forbidden(message: string = 'No tienes permisos para realizar esta acción'): ApiResponseType {
  return error(message, ErrorCode.FORBIDDEN)
}

/**
 * Error de recurso no encontrado (404)
 */
export function notFound(resource?: string, id?: number | string): ApiResponseType {
  const message = resource ? `${resource} no encontrado` : 'Recurso no encontrado'
  const details: NotFoundErrorDetails | undefined = resource || id ? { resource, id } : undefined

  return error(message, ErrorCode.NOT_FOUND, details)
}

/**
 * Error de conflicto (409)
 */
export function conflict(message: string, details?: any): ApiResponseType {
  return error(message, ErrorCode.CONFLICT, details)
}

/**
 * Error de entidad no procesable (422)
 */
export function unprocessableEntity(message: string, details?: any): ApiResponseType {
  return error(message, ErrorCode.UNPROCESSABLE_ENTITY, details)
}

/**
 * Error de límite de peticiones excedido (429)
 */
export function rateLimitExceeded(retryAfter: number): ApiResponseType {
  return {
    success: false,
    error: {
      message: 'Demasiadas peticiones. Intenta de nuevo más tarde',
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      details: {
        retryAfter,
      } as RateLimitErrorDetails,
    },
  }
}

/**
 * Error interno del servidor (500)
 */
export function serverError(errorMessage?: string, sentryId?: string): ApiResponseType {
  return {
    success: false,
    error: {
      message: errorMessage || 'Error interno del servidor',
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      ...(sentryId && {
        details: {
          sentryId,
        },
      }),
    },
  }
}

/**
 * Servicio no disponible (503)
 */
export function serviceUnavailable(message?: string, sentryId?: string): ApiResponseType {
  return {
    success: false,
    error: {
      message: message || 'Servicio no disponible',
      code: ErrorCode.SERVICE_UNAVAILABLE,
      ...(sentryId && {
        details: {
          sentryId,
        },
      }),
    },
  }
}

/**
 * Email no verificado
 */
export function emailNotVerified(): ApiResponseType {
  return error('Tu correo electrónico no ha sido verificado', ErrorCode.EMAIL_NOT_VERIFIED)
}

/**
 * Cuenta inactiva
 */
export function accountInactive(): ApiResponseType {
  return error('Tu cuenta está inactiva', ErrorCode.ACCOUNT_INACTIVE)
}

/**
 * Token inválido o expirado
 */
export function invalidToken(message: string = 'Token inválido o expirado'): ApiResponseType {
  return error(message, ErrorCode.INVALID_TOKEN)
}

/**
 * Las contraseñas no coinciden
 */
export function passwordMismatch(): ApiResponseType {
  return error('Las contraseñas no coinciden', ErrorCode.PASSWORD_MISMATCH)
}

/**
 * Exporta todas las funciones bajo un namespace
 */
export const ApiResponse = {
  success,
  error,
  validationError,
  validationErrorSingle,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  unprocessableEntity,
  rateLimitExceeded,
  serverError,
  serviceUnavailable,
  emailNotVerified,
  accountInactive,
  invalidToken,
  passwordMismatch,
}
