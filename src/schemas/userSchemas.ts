import { z } from 'zod'
import { UserRole } from '@/entities/User'

/**
 * Schema para login
 */
export const loginSchema = z.object({
  email: z.string().email('Correo electrónico inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
})

export type LoginInput = z.infer<typeof loginSchema>

/**
 * Schema para registro de usuario
 */
export const registerSchema = z.object({
  email: z.string().email('Correo electrónico inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  fullName: z.string().min(1, 'El nombre completo es requerido'),
  role: z.nativeEnum(UserRole).optional(),
})

export type RegisterInput = z.infer<typeof registerSchema>

/**
 * Schema para cambio de contraseña
 */
export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'La contraseña actual es requerida'),
  newPassword: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres'),
})

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

/**
 * Schema para enviar email de reset de contraseña
 */
export const sendResetPasswordSchema = z.object({
  email: z.string().email('Correo electrónico inválido'),
})

export type SendResetPasswordInput = z.infer<typeof sendResetPasswordSchema>

/**
 * Schema para reset de contraseña con token
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'El token es requerido'),
  newPassword: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres'),
  confirmNewPassword: z.string().min(6, 'La confirmación de contraseña es requerida'),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmNewPassword'],
})

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
