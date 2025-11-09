import { z } from 'zod'
import { Request, Response, NextFunction } from 'express'
import { ApiResponse } from '@/lib/apiResponse'

/**
 * Middleware para validar el body de la request con un schema de Zod
 * Si la validación falla, retorna un error 400 con formato ApiResponse
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)

    if (!result.success) {
      const errors = result.error.issues.map((err: z.ZodIssue) => ({
        field: err.path.join('.'),
        message: err.message,
      }))

      return res.status(400).json(ApiResponse.validationError(errors))
    }

    // Reemplazar req.body con los datos validados y transformados
    req.body = result.data
    next()
  }
}

/**
 * Valida datos con un schema de Zod y retorna el resultado
 * Útil para validación manual sin middleware
 */
export function validate<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> | null {
  const result = schema.safeParse(data)
  return result.success ? result.data : null
}

/**
 * Valida datos y obtiene los errores en formato ApiResponse
 */
export function getValidationErrors<T extends z.ZodTypeAny>(schema: T, data: unknown) {
  const result = schema.safeParse(data)

  if (result.success) {
    return null
  }

  return result.error.issues.map((err: z.ZodIssue) => ({
    field: err.path.join('.'),
    message: err.message,
  }))
}
