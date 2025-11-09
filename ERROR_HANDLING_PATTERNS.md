# Patrones de Manejo de Errores (Error Handling Patterns)

Este documento define los estándares para manejar errores de manera consistente y robusta en todo el backend.

## Principios

1. **Consistencia**: Todos los errores siguen el mismo formato
2. **Información útil**: Los errores deben ayudar a debuggear
3. **Seguridad**: No exponer información sensible en producción
4. **Trazabilidad**: Logging adecuado para monitoreo
5. **User-friendly**: Mensajes claros para el usuario final

---

## Tipos de Errores

### 1. Errores de Cliente (4xx)

Errores causados por el usuario o la aplicación cliente.

| Código | Tipo | Cuándo Usar |
|--------|------|-------------|
| 400 | Bad Request | Datos inválidos, parámetros faltantes |
| 401 | Unauthorized | No autenticado, token inválido |
| 403 | Forbidden | Autenticado pero sin permisos |
| 404 | Not Found | Recurso no existe |
| 409 | Conflict | Conflicto (ej: email duplicado) |
| 422 | Unprocessable Entity | Datos válidos pero no procesables |
| 429 | Too Many Requests | Rate limit excedido |

### 2. Errores de Servidor (5xx)

Errores causados por el servidor o sistemas externos.

| Código | Tipo | Cuándo Usar |
|--------|------|-------------|
| 500 | Internal Server Error | Error inesperado del servidor |
| 502 | Bad Gateway | Error en servicio externo |
| 503 | Service Unavailable | Servicio temporalmente no disponible |
| 504 | Gateway Timeout | Timeout en servicio externo |

---

## Arquitectura de Manejo de Errores

```
┌─────────────────────────────────────┐
│   API Layer                         │
│   - Captura errores                 │
│   - Convierte a ApiResponse         │
│   - Envía status code apropiado     │
└─────────────────────────────────────┘
            ↓ captura
┌─────────────────────────────────────┐
│   Service Layer                     │
│   - Lanza excepciones tipadas       │
│   - O retorna { error: string }     │
└─────────────────────────────────────┘
            ↓ lanza
┌─────────────────────────────────────┐
│   Error Handler Middleware          │
│   - Captura errores no manejados    │
│   - Logging (console, Sentry)       │
│   - Formato ApiResponse             │
└─────────────────────────────────────┘
```

---

## Patrón 1: Errores en Service Layer

### Opción A: Retornar Objeto con Error (Recomendado)

**Usar para:** Errores esperados de negocio

```typescript
// src/services/UserService.ts
export class UserService {
  async login(email: string, password: string): Promise<
    { user: User; token: string } |
    { error: 'INVALID_CREDENTIALS' | 'ACCOUNT_INACTIVE' | 'EMAIL_NOT_VERIFIED' }
  > {
    const user = await DI.users.findOne({ email })

    if (!user || !checkPassword(password, user.password)) {
      return { error: 'INVALID_CREDENTIALS' }
    }

    if (!user.isActive) {
      return { error: 'ACCOUNT_INACTIVE' }
    }

    if (!user.emailVerified) {
      return { error: 'EMAIL_NOT_VERIFIED' }
    }

    const token = generateAccessToken({ email, id: user.id, role: user.role })
    return { user, token }
  }
}
```

**Ventajas:**
- ✅ Type-safe (TypeScript sabe los errores posibles)
- ✅ Forzado a manejar errores
- ✅ No usa try-catch
- ✅ Más explícito

### Opción B: Lanzar Excepciones Personalizadas

**Usar para:** Errores excepcionales o inesperados

```typescript
// src/lib/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 400,
    public details?: any
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super('VALIDATION_ERROR', message, 400, details)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string | number) {
    super('NOT_FOUND', `${resource} no encontrado`, 404, { resource, id })
    this.name = 'NotFoundError'
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'No autorizado') {
    super('UNAUTHORIZED', message, 401)
    this.name = 'UnauthorizedError'
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super('CONFLICT', message, 409, details)
    this.name = 'ConflictError'
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(required: number, available: number) {
    super('INSUFFICIENT_BALANCE', 'Saldo insuficiente', 400, { required, available })
    this.name = 'InsufficientBalanceError'
  }
}
```

**Uso en Servicio:**
```typescript
// src/services/GiroService.ts
import { NotFoundError, InsufficientBalanceError } from '@/lib/errors'

export class GiroService {
  async createGiro(input: CreateGiroInput, userId: string): Promise<Giro> {
    const minorista = await DI.minoristas.findOne({ id: input.minoristaId })

    if (!minorista) {
      throw new NotFoundError('Minorista', input.minoristaId)
    }

    if (minorista.balance < input.amountBs) {
      throw new InsufficientBalanceError(input.amountBs, minorista.balance)
    }

    // ... crear giro
    return giro
  }
}
```

**Ventajas:**
- ✅ Código más limpio sin if's anidados
- ✅ Stack trace automático
- ✅ Interrumpe flujo inmediatamente
- ✅ Familiar para desarrolladores

---

## Patrón 2: Manejo en API Layer

### Con Retorno de Error (Opción A)

```typescript
// src/api/user.ts
userRouter.post('/login', validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body

  const result = await userService.login(email, password)

  // Type-safe: TypeScript sabe los errores posibles
  if ('error' in result) {
    const errorMessages = {
      INVALID_CREDENTIALS: 'Credenciales inválidas',
      ACCOUNT_INACTIVE: 'Tu cuenta está inactiva',
      EMAIL_NOT_VERIFIED: 'Debes verificar tu email primero',
    }

    const statusCodes = {
      INVALID_CREDENTIALS: 401,
      ACCOUNT_INACTIVE: 403,
      EMAIL_NOT_VERIFIED: 403,
    }

    return res
      .status(statusCodes[result.error])
      .json(ApiResponse.error(errorMessages[result.error], result.error))
  }

  // TypeScript sabe que aquí result tiene user y token
  const { user, token } = result

  res.cookie('accessToken', token, { httpOnly: true, sameSite: 'strict' })
  res.json(ApiResponse.success({ user }))
})
```

### Con Excepciones (Opción B)

```typescript
// src/api/giro.ts
giroRouter.post('/', requireAuth(), validateBody(createGiroSchema), async (req, res) => {
  try {
    const user = req.context.requestUser.user
    const giro = await giroService.createGiro(req.body, user.id)

    res.status(201).json(ApiResponse.success({ giro }))
  } catch (error) {
    // El middleware global manejará esto
    throw error
  }
})
```

---

## Patrón 3: Error Handler Middleware (Global)

Captura todos los errores no manejados y los convierte a formato consistente.

```typescript
// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express'
import { ApiResponse } from '@/lib/apiResponse'
import { AppError } from '@/lib/errors'
import * as Sentry from '@sentry/node'

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log del error
  console.error('❌ Error:', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    user: req.context?.requestUser?.user?.id,
  })

  // Enviar a Sentry en producción
  if (process.env.NODE_ENV === 'production') {
    Sentry.captureException(err)
  }

  // Errores personalizados de la app
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(
      ApiResponse.error(err.message, err.code as any, err.details)
    )
  }

  // Errores de validación de Zod
  if (err.name === 'ZodError') {
    return res.status(400).json(
      ApiResponse.validationError(
        (err as any).errors.map((e: any) => ({
          field: e.path.join('.'),
          message: e.message,
        }))
      )
    )
  }

  // Errores de MikroORM
  if (err.name === 'UniqueConstraintViolationException') {
    return res.status(409).json(
      ApiResponse.conflict('Ya existe un registro con estos datos')
    )
  }

  if (err.name === 'NotFoundError') {
    return res.status(404).json(
      ApiResponse.notFound()
    )
  }

  // Error genérico del servidor
  const sentryId = process.env.NODE_ENV === 'production'
    ? Sentry.lastEventId()
    : undefined

  return res.status(500).json(
    ApiResponse.serverError(
      process.env.NODE_ENV === 'production'
        ? undefined  // No exponer detalles en producción
        : err.message,
      sentryId
    )
  )
}
```

**Registrar en Express:**

```typescript
// src/expressServer.ts
import { errorHandler } from '@/middleware/errorHandler'

// ... todas las rutas

// IMPORTANTE: El error handler debe ir al final, después de todas las rutas
app.use(errorHandler)
```

---

## Patrón 4: Validación con Zod

La validación ya maneja errores automáticamente.

```typescript
// src/lib/zodUtils.ts (ya implementado)
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

    req.body = result.data
    next()
  }
}
```

**Uso:**
```typescript
userRouter.post('/register', validateBody(registerSchema), async (req, res) => {
  // Si llegamos aquí, req.body está validado
  // Si la validación falla, el middleware ya respondió con error 400
})
```

---

## Patrón 5: Async Error Wrapper

Evita repetir try-catch en cada endpoint.

```typescript
// src/lib/asyncHandler.ts
import { Request, Response, NextFunction } from 'express'

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
```

**Uso:**
```typescript
// Sin wrapper (necesitas try-catch manual)
userRouter.post('/login', async (req, res) => {
  try {
    const result = await userService.login(req.body.email, req.body.password)
    res.json(result)
  } catch (error) {
    next(error)
  }
})

// Con wrapper (no necesitas try-catch)
userRouter.post('/login', asyncHandler(async (req, res) => {
  const result = await userService.login(req.body.email, req.body.password)
  res.json(result)
  // Si hay error, automáticamente va al error handler middleware
}))
```

---

## Patrón 6: Logging Estructurado

### Setup de Logger

```typescript
// src/lib/logger.ts
import pino from 'pino'

const isDevelopment = process.env.NODE_ENV === 'development'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
})

// Helpers tipados
export const logError = (error: Error, context?: Record<string, any>) => {
  logger.error({
    err: error,
    ...context,
  }, error.message)
}

export const logWarning = (message: string, context?: Record<string, any>) => {
  logger.warn(context, message)
}

export const logInfo = (message: string, context?: Record<string, any>) => {
  logger.info(context, message)
}
```

### Uso en Servicios

```typescript
// src/services/UserService.ts
import { logError, logWarning, logInfo } from '@/lib/logger'

export class UserService {
  async login(email: string, password: string) {
    try {
      const user = await DI.users.findOne({ email })

      if (!user) {
        logWarning('Login attempt with non-existent email', { email })
        return { error: 'INVALID_CREDENTIALS' }
      }

      if (!checkPassword(password, user.password)) {
        logWarning('Login attempt with wrong password', {
          userId: user.id,
          email: user.email
        })
        return { error: 'INVALID_CREDENTIALS' }
      }

      logInfo('User logged in successfully', {
        userId: user.id,
        email: user.email
      })

      return { user, token: generateAccessToken({ ... }) }
    } catch (error) {
      logError(error as Error, { email })
      throw error
    }
  }
}
```

---

## Patrón 7: Integración con Sentry

### Setup

```typescript
// src/sentry.ts
import * as Sentry from '@sentry/node'
import { SENTRY_DSN, NODE_ENV } from '@/settings'

export function initSentry() {
  if (SENTRY_DSN && NODE_ENV === 'production') {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: NODE_ENV,
      tracesSampleRate: 0.1, // 10% de las transacciones

      // Filtrar datos sensibles
      beforeSend(event) {
        // No enviar passwords
        if (event.request?.data) {
          const data = event.request.data as any
          if (data.password) {
            data.password = '[FILTERED]'
          }
          if (data.oldPassword) {
            data.oldPassword = '[FILTERED]'
          }
          if (data.newPassword) {
            data.newPassword = '[FILTERED]'
          }
        }
        return event
      },
    })

    console.log('✅ Sentry initialized')
  }
}
```

### Captura Manual

```typescript
// src/services/PaymentService.ts
import * as Sentry from '@sentry/node'

export class PaymentService {
  async processPayment(amount: number) {
    try {
      // ... lógica de pago
    } catch (error) {
      // Agregar contexto extra para Sentry
      Sentry.setContext('payment', {
        amount,
        currency: 'VES',
        timestamp: new Date().toISOString(),
      })

      Sentry.captureException(error)

      throw new AppError(
        'PAYMENT_FAILED',
        'Error procesando el pago',
        500,
        { sentryId: Sentry.lastEventId() }
      )
    }
  }
}
```

---

## Ejemplos Completos

### Ejemplo 1: Crear Giro con Validaciones

```typescript
// src/services/GiroService.ts
import { NotFoundError, InsufficientBalanceError } from '@/lib/errors'
import { logInfo, logError } from '@/lib/logger'

export class GiroService {
  async createGiro(input: CreateGiroInput, userId: string): Promise<Giro> {
    // 1. Validar minorista
    const minorista = await DI.minoristas.findOne(
      { id: input.minoristaId },
      { populate: ['user'] }
    )

    if (!minorista) {
      throw new NotFoundError('Minorista', input.minoristaId)
    }

    // 2. Obtener tasa de cambio
    const exchangeRate = await DI.exchangeRates.findOne({}, {
      orderBy: { createdAt: 'DESC' }
    })

    if (!exchangeRate) {
      logError(new Error('No exchange rate available'), {
        minoristaId: input.minoristaId
      })
      throw new AppError(
        'NO_EXCHANGE_RATE',
        'No hay tasa de cambio disponible',
        503
      )
    }

    // 3. Calcular monto
    const rate = input.currencyInput === Currency.COP
      ? exchangeRate.copToBs
      : exchangeRate.usdToBs
    const amountBs = input.amountInput * rate

    // 4. Verificar saldo
    if (minorista.balance < amountBs) {
      throw new InsufficientBalanceError(amountBs, minorista.balance)
    }

    // 5. Crear giro
    const createdBy = await DI.users.findOne({ id: userId })
    if (!createdBy) {
      throw new NotFoundError('User', userId)
    }

    const giro = DI.giros.create({
      minorista,
      beneficiaryName: input.beneficiaryName,
      beneficiaryId: input.beneficiaryId,
      bankName: input.bankName,
      accountNumber: input.accountNumber,
      phone: input.phone,
      amountInput: input.amountInput,
      currencyInput: input.currencyInput,
      amountBs,
      rateApplied: exchangeRate,
      status: GiroStatus.PENDIENTE,
      createdBy,
    })

    minorista.balance -= amountBs

    await DI.em.persistAndFlush([giro, minorista])

    logInfo('Giro created successfully', {
      giroId: giro.id,
      minoristaId: minorista.id,
      amountBs,
      createdBy: userId,
    })

    return giro
  }
}
```

**Endpoint:**
```typescript
// src/api/giro.ts
import { asyncHandler } from '@/lib/asyncHandler'

giroRouter.post('/',
  requireAuth(),
  validateBody(createGiroSchema),
  asyncHandler(async (req, res) => {
    const user = req.context.requestUser.user
    const giro = await giroService.createGiro(req.body, user.id)

    res.status(201).json(ApiResponse.success({ giro }))
  })
)
```

El error handler middleware capturará automáticamente:
- `NotFoundError` → 404
- `InsufficientBalanceError` → 400
- `AppError` → status code personalizado
- Cualquier otro error → 500

---

### Ejemplo 2: Actualizar Perfil

```typescript
// src/services/UserService.ts
export class UserService {
  async updateProfile(
    userId: string,
    updates: { fullName?: string; phone?: string }
  ): Promise<User | { error: string }> {
    const user = await DI.users.findOne({ id: userId })

    if (!user) {
      return { error: 'USER_NOT_FOUND' }
    }

    if (updates.fullName) {
      if (updates.fullName.length < 3) {
        return { error: 'FULLNAME_TOO_SHORT' }
      }
      user.fullName = updates.fullName
    }

    if (updates.phone) {
      // Validar formato de teléfono
      if (!/^\+?[0-9]{10,15}$/.test(updates.phone)) {
        return { error: 'INVALID_PHONE_FORMAT' }
      }
      // @ts-ignore - si agregamos campo phone a User
      user.phone = updates.phone
    }

    await DI.em.flush()

    logInfo('User profile updated', { userId, updates })

    return user
  }
}
```

**Endpoint:**
```typescript
userRouter.patch('/profile',
  requireAuth(),
  validateBody(updateProfileSchema),
  async (req, res) => {
    const user = req.context.requestUser.user
    const result = await userService.updateProfile(user.id, req.body)

    if ('error' in result) {
      const errors = {
        USER_NOT_FOUND: 'Usuario no encontrado',
        FULLNAME_TOO_SHORT: 'El nombre debe tener al menos 3 caracteres',
        INVALID_PHONE_FORMAT: 'Formato de teléfono inválido',
      }
      return res.status(400).json(ApiResponse.badRequest(errors[result.error]))
    }

    res.json(ApiResponse.success({ user: result }))
  }
)
```

---

## Buenas Prácticas

### ✅ DO (Hacer)

1. **Siempre usar ApiResponse en respuestas**
   ```typescript
   res.json(ApiResponse.success({ data }))
   res.status(400).json(ApiResponse.badRequest('mensaje'))
   ```

2. **Loggear errores con contexto**
   ```typescript
   logError(error, { userId, action: 'create_giro', input })
   ```

3. **Usar códigos de error específicos**
   ```typescript
   return { error: 'INSUFFICIENT_BALANCE' } // ✅
   return { error: 'Error' } // ❌
   ```

4. **Capturar errores críticos en Sentry**
   ```typescript
   Sentry.captureException(error)
   ```

5. **Proveer detalles útiles en desarrollo**
   ```typescript
   if (NODE_ENV === 'development') {
     error.details = { stack: err.stack }
   }
   ```

6. **Validar entrada con Zod**
   ```typescript
   validateBody(schema) // Maneja errores automáticamente
   ```

### ❌ DON'T (No Hacer)

1. **No exponer stack traces en producción**
   ```typescript
   // ❌ MAL
   res.status(500).json({ error: err.stack })

   // ✅ BIEN
   res.status(500).json(ApiResponse.serverError())
   ```

2. **No ignorar errores silenciosamente**
   ```typescript
   // ❌ MAL
   try {
     await someOperation()
   } catch (err) {
     // ignorado
   }

   // ✅ BIEN
   try {
     await someOperation()
   } catch (err) {
     logError(err as Error, { context })
     throw err
   }
   ```

3. **No usar strings mágicos**
   ```typescript
   // ❌ MAL
   if (result.error === 'user not found') { }

   // ✅ BIEN
   if (result.error === 'USER_NOT_FOUND') { }
   ```

4. **No mezclar formatos de error**
   ```typescript
   // ❌ MAL - Inconsistente
   res.json({ error: 'algo' })
   res.json({ message: 'algo' })
   res.json({ err: 'algo' })

   // ✅ BIEN - Siempre ApiResponse
   res.json(ApiResponse.error('algo', 'CODE'))
   ```

5. **No loggear información sensible**
   ```typescript
   // ❌ MAL
   logger.info('Login', { password: req.body.password })

   // ✅ BIEN
   logger.info('Login', { email: req.body.email })
   ```

---

## Checklist de Implementación

Al implementar manejo de errores en un nuevo endpoint/servicio:

- [ ] ✅ Validación de entrada con Zod schema
- [ ] ✅ Servicio retorna tipos específicos con errores
- [ ] ✅ Endpoint maneja todos los casos de error del servicio
- [ ] ✅ Usar `ApiResponse` para todas las respuestas
- [ ] ✅ Status codes HTTP apropiados
- [ ] ✅ Logging de errores importantes
- [ ] ✅ Try-catch solo donde sea necesario
- [ ] ✅ Errores con códigos descriptivos (no genéricos)
- [ ] ✅ No exponer información sensible
- [ ] ✅ Mensajes user-friendly en español

---

## Tabla de Referencia Rápida

| Situación | Qué Hacer | Código | Ejemplo |
|-----------|-----------|--------|---------|
| Email duplicado | ConflictError | 409 | `ApiResponse.conflict('Email ya existe')` |
| Usuario no existe | NotFoundError | 404 | `ApiResponse.notFound('User', id)` |
| Credenciales inválidas | Retornar error | 401 | `return { error: 'INVALID_CREDENTIALS' }` |
| Saldo insuficiente | InsufficientBalanceError | 400 | `throw new InsufficientBalanceError(...)` |
| Datos faltantes | Zod validación | 400 | `validateBody(schema)` |
| Sin permisos | Middleware | 403 | `requireRole(UserRole.ADMIN)` |
| Token inválido | Middleware | 401 | `ApiResponse.invalidToken()` |
| Error de BD | Capturar y loggear | 500 | `Sentry.captureException(err)` |
| Servicio externo caído | AppError | 503 | `throw new AppError('SERVICE_DOWN', ...)` |

---

## Testing de Errores

```typescript
// tests/services/UserService.test.ts
describe('UserService', () => {
  describe('login', () => {
    it('should return error for non-existent user', async () => {
      const result = await userService.login('fake@example.com', 'password')

      expect(result).toEqual({ error: 'INVALID_CREDENTIALS' })
    })

    it('should return error for wrong password', async () => {
      // Crear usuario primero
      await userService.register({
        email: 'test@example.com',
        password: 'correct',
        fullName: 'Test'
      })

      const result = await userService.login('test@example.com', 'wrong')

      expect(result).toEqual({ error: 'INVALID_CREDENTIALS' })
    })

    it('should return error for inactive account', async () => {
      const user = await createTestUser({ isActive: false })

      const result = await userService.login(user.email, 'password')

      expect(result).toEqual({ error: 'ACCOUNT_INACTIVE' })
    })
  })
})
```

---

## Resumen

| Concepto | Implementación |
|----------|----------------|
| **Validación** | Zod schemas + `validateBody()` |
| **Errores de Negocio** | Retornar `{ error: string }` desde servicios |
| **Errores Excepcionales** | Lanzar `AppError` o custom errors |
| **Respuestas** | Siempre usar `ApiResponse` |
| **Logging** | `logger.error()`, `logger.warn()`, `logger.info()` |
| **Monitoring** | Sentry para errores en producción |
| **Middleware** | Error handler global al final |
| **Async** | `asyncHandler()` para evitar try-catch repetidos |

---

## Recursos

- Ver implementación en `src/middleware/errorHandler.ts`
- Ver errores personalizados en `src/lib/errors.ts`
- Ver logger en `src/lib/logger.ts`
- Integración Sentry en `src/sentry.ts`
