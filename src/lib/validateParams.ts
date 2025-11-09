// src/lib/zodUtils.ts
import { Request, Response, NextFunction } from 'express'
import { ZodSchema, ZodError } from 'zod'
import { ApiResponse } from './apiResponse'

export const validateParams = (schema: ZodSchema<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.params)
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        const firstError = err.issues[0]
        return res.status(400).json(ApiResponse.validationErrorSingle(firstError.path.join('.'), firstError.message))
      }
      next(err)
    }
  }
}
