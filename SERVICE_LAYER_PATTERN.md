# Patrón de Capa de Servicios (Service Layer)

Este documento define el estándar para organizar la lógica de negocio en el backend usando el patrón de **Service Layer**.

## Principios

1. **Separación de Responsabilidades**: Los endpoints solo manejan HTTP, los servicios manejan lógica de negocio
2. **Reutilización**: La lógica en servicios puede usarse desde múltiples endpoints o contextos
3. **Testabilidad**: Los servicios son fáciles de testear sin depender de HTTP
4. **Mantenibilidad**: La lógica de negocio está centralizada y organizada

---

## Arquitectura en 3 Capas

```
┌─────────────────────────────────────┐
│   API Layer (Endpoints)             │  ← Maneja HTTP: request, response, cookies, status codes
│   src/api/*.ts                      │
└─────────────────────────────────────┘
            ↓ llama a
┌─────────────────────────────────────┐
│   Service Layer (Lógica de Negocio)│  ← Lógica de negocio, validaciones, reglas
│   src/services/*.ts                 │
└─────────────────────────────────────┘
            ↓ usa
┌─────────────────────────────────────┐
│   Data Layer (Entities + DI)        │  ← Acceso a base de datos
│   src/entities/*.ts + src/di.ts    │
└─────────────────────────────────────┘
```

---

## Estructura de Archivos

```
backend/src/
├── api/                    # 🌐 Endpoints HTTP (capa de presentación)
│   ├── user.ts            # Rutas de usuario
│   ├── giro.ts            # Rutas de giros
│   └── bank.ts            # Rutas de bancos
│
├── services/              # 💼 Lógica de negocio
│   ├── UserService.ts     # Lógica de usuarios
│   ├── GiroService.ts     # Lógica de giros
│   └── BankService.ts     # Lógica de bancos
│
├── schemas/               # 📋 Validación con Zod
│   ├── userSchemas.ts
│   ├── giroSchemas.ts
│   └── bankSchemas.ts
│
├── entities/              # 💾 Modelos de base de datos
├── middleware/            # 🔒 Middlewares
├── lib/                   # 🛠️ Utilidades
└── di.ts                  # Dependency Injection
```

---

## Ejemplo Completo: UserService

### 1. Crear el Servicio

**Archivo**: `src/services/UserService.ts`

```typescript
import { DI } from '@/di'
import { User, UserRole } from '@/entities/User'
import { TokenType } from '@/entities/UserToken'
import { checkPassword, makePassword } from '@/lib/passwordUtils'
import { generateAccessToken } from '@/lib/tokenUtils'
import { createUserToken, validateUserToken, markTokenUsed } from '@/lib/userTokenUtils'
import { sendEmail } from '@/lib/emailUtils'

export class UserService {
  /**
   * Autentica un usuario con email y contraseña
   */
  async login(email: string, password: string): Promise<{ user: User; token: string } | null> {
    const userRepo = DI.em.getRepository(User)
    const user = await userRepo.findOne({ email })

    if (!user || !checkPassword(password, user.password)) {
      return null
    }

    const token = generateAccessToken({
      email: user.email,
      id: user.id,
      role: user.role,
    })

    return { user, token }
  }

  /**
   * Crea un nuevo usuario
   */
  async register(data: {
    email: string
    password: string
    fullName: string
    role?: UserRole
  }): Promise<{ user: User; token: string } | { error: 'USER_EXISTS' }> {
    const userRepo = DI.em.getRepository(User)
    const existing = await userRepo.findOne({ email: data.email })

    if (existing) {
      return { error: 'USER_EXISTS' }
    }

    const hashedPassword = makePassword(data.password)
    const user = userRepo.create({
      email: data.email,
      fullName: data.fullName,
      password: hashedPassword,
      role: data.role || UserRole.MINORISTA,
      isActive: true,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await DI.em.persistAndFlush(user)

    const token = generateAccessToken({
      email: user.email,
      id: user.id,
      role: user.role,
    })

    return { user, token }
  }

  /**
   * Cambia la contraseña de un usuario
   */
  async changePassword(user: User, oldPassword: string, newPassword: string): Promise<boolean> {
    if (!checkPassword(oldPassword, user.password)) {
      return false
    }

    user.password = makePassword(newPassword)
    await DI.em.persistAndFlush(user)

    return true
  }

  // ... más métodos
}

// Exportar una instancia singleton
export const userService = new UserService()
```

### 2. Usar el Servicio en el Endpoint

**Archivo**: `src/api/user.ts`

```typescript
import { userService } from '@/services/UserService'
import { ApiResponse } from '@/lib/apiResponse'
import { validateBody } from '@/lib/zodUtils'
import { loginSchema } from '@/schemas/userSchemas'

// ❌ ANTES (sin servicio): Lógica mezclada en el endpoint
userRouter.post('/login', async (req, res) => {
  const { email, password } = req.body

  // Validación manual
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing fields' })
  }

  // Lógica de negocio en el endpoint
  const userRepo = DI.em.getRepository(User)
  const user = await userRepo.findOne({ email })

  if (!user || !checkPassword(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const token = generateAccessToken({ email, id: user.id, role: user.role })

  res.cookie('accessToken', token, { httpOnly: true })
  res.json({ user })
})

// ✅ DESPUÉS (con servicio): Endpoint simple y limpio
userRouter.post('/login', validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body

  const result = await userService.login(email, password)

  if (!result) {
    return res.status(401).json(ApiResponse.unauthorized('Credenciales inválidas'))
  }

  const { user, token } = result

  res.cookie('accessToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  })

  res.json(ApiResponse.success({
    message: 'Inicio de sesión exitoso',
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    },
  }))
})
```

---

## Responsabilidades de Cada Capa

### 🌐 API Layer (Endpoints)

**Responsabilidades:**
- ✅ Recibir requests HTTP
- ✅ Validar datos con Zod schemas
- ✅ Llamar al servicio apropiado
- ✅ Manejar respuestas HTTP (status codes, cookies, headers)
- ✅ Formatear respuestas con `ApiResponse`

**NO debe hacer:**
- ❌ Lógica de negocio
- ❌ Acceso directo a la base de datos
- ❌ Cálculos o transformaciones complejas

**Ejemplo:**
```typescript
userRouter.post('/register',
  requireRole(UserRole.SUPER_ADMIN),
  validateBody(registerSchema),
  async (req, res) => {
    const result = await userService.register(req.body)

    if ('error' in result) {
      return res.status(409).json(ApiResponse.conflict('Usuario ya existe'))
    }

    res.status(201).json(ApiResponse.success({ user: result.user }))
  }
)
```

### 💼 Service Layer (Servicios)

**Responsabilidades:**
- ✅ Implementar lógica de negocio
- ✅ Coordinar operaciones entre múltiples entidades
- ✅ Aplicar reglas de negocio
- ✅ Manejar transacciones
- ✅ Interactuar con repositorios (DI)

**NO debe hacer:**
- ❌ Manejar requests/responses HTTP
- ❌ Conocer sobre cookies, headers, status codes
- ❌ Validar datos de entrada (eso es responsabilidad de Zod schemas)

**Ejemplo:**
```typescript
export class GiroService {
  async createGiro(data: CreateGiroInput): Promise<Giro> {
    const minorista = await DI.minoristas.findOne({ id: data.minoristaId })

    // Regla de negocio: verificar saldo
    if (minorista.balance < data.amountBs) {
      throw new Error('INSUFFICIENT_BALANCE')
    }

    // Crear giro
    const giro = DI.giros.create({
      minorista,
      amountInput: data.amountInput,
      currencyInput: data.currencyInput,
      status: GiroStatus.PENDIENTE,
    })

    // Descontar del balance del minorista
    minorista.balance -= data.amountBs

    await DI.em.persistAndFlush([giro, minorista])

    return giro
  }
}
```

### 💾 Data Layer (Entities)

**Responsabilidades:**
- ✅ Definir modelos de base de datos
- ✅ Relaciones entre entidades
- ✅ Tipos y validaciones básicas

---

## Buenas Prácticas

### 1. Un Servicio por Entidad Principal

```typescript
// ✅ Bien organizado
UserService.ts      → Maneja User
GiroService.ts      → Maneja Giro
BankService.ts      → Maneja Bank
MinoristaService.ts → Maneja Minorista
```

### 2. Métodos Descriptivos

```typescript
// ❌ Mal: Nombres genéricos
async create(data: any) { }
async get(id: string) { }

// ✅ Bien: Nombres específicos
async createGiro(data: CreateGiroInput): Promise<Giro> { }
async findGiroById(id: string): Promise<Giro | null> { }
async assignGiroToTransferencista(giroId: string, transferencistaId: string): Promise<Giro> { }
```

### 3. Retornar Tipos Específicos

```typescript
// ❌ Mal: Retorna any o void
async login(email: string, password: string): Promise<any> { }

// ✅ Bien: Retorna tipos específicos
async login(email: string, password: string): Promise<{ user: User; token: string } | null> { }
async register(data: RegisterInput): Promise<{ user: User; token: string } | { error: 'USER_EXISTS' }> { }
```

### 4. Manejo de Errores en Servicios

```typescript
// Opción 1: Retornar null para "no encontrado"
async findUserByEmail(email: string): Promise<User | null> {
  return DI.users.findOne({ email })
}

// Opción 2: Retornar objeto con error
async createGiro(data: CreateGiroInput): Promise<Giro | { error: string }> {
  if (insufficientBalance) {
    return { error: 'INSUFFICIENT_BALANCE' }
  }
  return giro
}

// Opción 3: Lanzar excepciones para errores graves
async processPayment(amount: number): Promise<void> {
  if (paymentGatewayDown) {
    throw new Error('PAYMENT_GATEWAY_UNAVAILABLE')
  }
}
```

### 5. Singleton vs Instancias

```typescript
// ✅ Recomendado: Singleton (sin estado interno)
export class UserService {
  async login(email: string, password: string) { }
}

export const userService = new UserService()

// ❌ Evitar: Servicios con estado mutable
export class UserService {
  private currentUser: User // ❌ Estado interno

  async login(email: string, password: string) { }
}
```

### 6. Inyección de Dependencias

```typescript
// ✅ Bien: Usar DI global
export class UserService {
  async findById(id: string) {
    return DI.users.findOne({ id })
  }
}

// También aceptable: Inyectar dependencias en constructor
export class UserService {
  constructor(private userRepo: EntityRepository<User>) {}

  async findById(id: string) {
    return this.userRepo.findOne({ id })
  }
}
```

---

## Ejemplo Completo: GiroService

### Service

```typescript
// src/services/GiroService.ts
import { DI } from '@/di'
import { Giro, GiroStatus } from '@/entities/Giro'
import { Currency } from '@/entities/Bank'
import { ExchangeRate } from '@/entities/ExchangeRate'

export interface CreateGiroInput {
  minoristaId: string
  beneficiaryName: string
  beneficiaryId: string
  bankName: string
  accountNumber: string
  phone: string
  amountInput: number
  currencyInput: Currency
}

export class GiroService {
  /**
   * Crea un nuevo giro
   */
  async createGiro(input: CreateGiroInput, createdByUserId: string): Promise<Giro | { error: string }> {
    // 1. Validar que el minorista existe
    const minorista = await DI.minoristas.findOne(
      { id: input.minoristaId },
      { populate: ['user'] }
    )

    if (!minorista) {
      return { error: 'MINORISTA_NOT_FOUND' }
    }

    // 2. Obtener tasa de cambio actual
    const exchangeRate = await DI.exchangeRates.findOne({}, {
      orderBy: { createdAt: 'DESC' }
    })

    if (!exchangeRate) {
      return { error: 'NO_EXCHANGE_RATE_AVAILABLE' }
    }

    // 3. Calcular monto en Bs
    const rate = input.currencyInput === Currency.COP
      ? exchangeRate.copToBs
      : exchangeRate.usdToBs
    const amountBs = input.amountInput * rate

    // 4. Verificar saldo del minorista
    if (minorista.balance < amountBs) {
      return { error: 'INSUFFICIENT_BALANCE' }
    }

    // 5. Crear giro
    const createdBy = await DI.users.findOne({ id: createdByUserId })
    if (!createdBy) {
      return { error: 'USER_NOT_FOUND' }
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

    // 6. Descontar del balance
    minorista.balance -= amountBs

    await DI.em.persistAndFlush([giro, minorista])

    return giro
  }

  /**
   * Lista giros con filtros
   */
  async listGiros(filters: {
    status?: GiroStatus
    minoristaId?: string
    transferencistaId?: string
    limit?: number
    offset?: number
  }) {
    const where: any = {}

    if (filters.status) where.status = filters.status
    if (filters.minoristaId) where.minorista = filters.minoristaId
    if (filters.transferencistaId) where.transferencista = filters.transferencistaId

    const [giros, total] = await DI.giros.findAndCount(where, {
      limit: filters.limit || 20,
      offset: filters.offset || 0,
      orderBy: { createdAt: 'DESC' },
      populate: ['minorista.user', 'transferencista.user'],
    })

    return { giros, total }
  }

  /**
   * Asigna un giro a un transferencista
   */
  async assignToTransferencista(giroId: string, transferencistaId: string): Promise<Giro | { error: string }> {
    const giro = await DI.giros.findOne({ id: giroId })

    if (!giro) {
      return { error: 'GIRO_NOT_FOUND' }
    }

    if (giro.status !== GiroStatus.PENDIENTE) {
      return { error: 'GIRO_ALREADY_ASSIGNED' }
    }

    const transferencista = await DI.transferencistas.findOne({ id: transferencistaId })

    if (!transferencista) {
      return { error: 'TRANSFERENCISTA_NOT_FOUND' }
    }

    if (!transferencista.available) {
      return { error: 'TRANSFERENCISTA_NOT_AVAILABLE' }
    }

    giro.transferencista = transferencista
    giro.status = GiroStatus.ASIGNADO
    transferencista.available = false

    await DI.em.persistAndFlush([giro, transferencista])

    return giro
  }
}

export const giroService = new GiroService()
```

### Schema

```typescript
// src/schemas/giroSchemas.ts
import { z } from 'zod'
import { Currency } from '@/entities/Bank'
import { GiroStatus } from '@/entities/Giro'

export const createGiroSchema = z.object({
  minoristaId: z.string().uuid('ID de minorista inválido'),
  beneficiaryName: z.string().min(1, 'El nombre del beneficiario es requerido'),
  beneficiaryId: z.string().min(1, 'La cédula del beneficiario es requerida'),
  bankName: z.string().min(1, 'El nombre del banco es requerido'),
  accountNumber: z.string().min(1, 'El número de cuenta es requerido'),
  phone: z.string().min(1, 'El teléfono es requerido'),
  amountInput: z.number().positive('El monto debe ser positivo'),
  currencyInput: z.nativeEnum(Currency, { errorMap: () => ({ message: 'Moneda inválida' }) }),
})

export const listGirosSchema = z.object({
  status: z.nativeEnum(GiroStatus).optional(),
  minoristaId: z.string().uuid().optional(),
  transferencistaId: z.string().uuid().optional(),
  limit: z.number().positive().max(100).optional(),
  offset: z.number().min(0).optional(),
})
```

### Endpoint

```typescript
// src/api/giro.ts
import { giroService } from '@/services/GiroService'
import { validateBody } from '@/lib/zodUtils'
import { createGiroSchema, listGirosSchema } from '@/schemas/giroSchemas'
import { ApiResponse } from '@/lib/apiResponse'

export const giroRouter = express.Router()

// Crear giro
giroRouter.post('/',
  requireAuth(),
  validateBody(createGiroSchema),
  async (req, res) => {
    const user = req.context.requestUser.user
    const result = await giroService.createGiro(req.body, user.id)

    if ('error' in result) {
      const errorMessages = {
        MINORISTA_NOT_FOUND: 'Minorista no encontrado',
        NO_EXCHANGE_RATE_AVAILABLE: 'No hay tasa de cambio disponible',
        INSUFFICIENT_BALANCE: 'Saldo insuficiente',
        USER_NOT_FOUND: 'Usuario no encontrado',
      }

      return res.status(400).json(ApiResponse.badRequest(errorMessages[result.error]))
    }

    res.status(201).json(ApiResponse.success({ giro: result }))
  }
)

// Listar giros
giroRouter.get('/',
  requireAuth(),
  async (req, res) => {
    const filters = listGirosSchema.parse(req.query)
    const { giros, total } = await giroService.listGiros(filters)

    res.json(ApiResponse.success({ giros, total }))
  }
)
```

---

## Ventajas del Patrón de Servicios

### ✅ 1. Código Reutilizable

```typescript
// El mismo servicio puede usarse desde múltiples lugares
await userService.login(email, password)  // Desde API REST
await userService.login(email, password)  // Desde GraphQL
await userService.login(email, password)  // Desde CLI scripts
```

### ✅ 2. Fácil de Testear

```typescript
// Test del servicio (sin HTTP)
describe('UserService', () => {
  it('should login user with valid credentials', async () => {
    const result = await userService.login('test@example.com', 'password123')

    expect(result).not.toBeNull()
    expect(result.user.email).toBe('test@example.com')
    expect(result.token).toBeDefined()
  })

  it('should return null with invalid credentials', async () => {
    const result = await userService.login('test@example.com', 'wrongpassword')

    expect(result).toBeNull()
  })
})
```

### ✅ 3. Lógica Centralizada

```typescript
// Regla de negocio en un solo lugar
// Si cambia la lógica, solo se modifica el servicio
async changePassword(user: User, oldPassword: string, newPassword: string) {
  // Regla: contraseña debe tener al menos 8 caracteres
  if (newPassword.length < 8) {
    return { error: 'PASSWORD_TOO_SHORT' }
  }

  // Regla: nueva contraseña no puede ser igual a la antigua
  if (oldPassword === newPassword) {
    return { error: 'PASSWORD_SAME_AS_OLD' }
  }

  // ... más reglas
}
```

### ✅ 4. Endpoints Más Limpios

```typescript
// Endpoint super simple
userRouter.post('/change-password', requireAuth(), validateBody(changePasswordSchema), async (req, res) => {
  const result = await userService.changePassword(req.context.user, req.body.oldPassword, req.body.newPassword)

  if ('error' in result) {
    return res.status(400).json(ApiResponse.badRequest(result.error))
  }

  res.json(ApiResponse.success({ message: 'Contraseña cambiada' }))
})
```

---

## Migración Gradual

Si ya tienes endpoints sin servicios, puedes migrar gradualmente:

### Paso 1: Crear el servicio
```typescript
// src/services/GiroService.ts
export class GiroService {
  async createGiro(data) {
    // Mover lógica aquí
  }
}

export const giroService = new GiroService()
```

### Paso 2: Refactorizar endpoint existente
```typescript
// Antes
giroRouter.post('/', async (req, res) => {
  // 50 líneas de lógica aquí
})

// Después
giroRouter.post('/', validateBody(schema), async (req, res) => {
  const result = await giroService.createGiro(req.body)
  res.json(ApiResponse.success({ giro: result }))
})
```

---

## Checklist de Implementación

Cuando crees un nuevo servicio:

- [ ] ✅ Crear archivo en `src/services/[Entity]Service.ts`
- [ ] ✅ Crear clase con métodos descriptivos
- [ ] ✅ Exportar singleton al final
- [ ] ✅ Cada método tiene tipos de entrada/salida claros
- [ ] ✅ Usar `DI` para acceso a repositorios
- [ ] ✅ NO incluir lógica HTTP (req, res, status codes)
- [ ] ✅ Retornar tipos específicos (no any)
- [ ] ✅ Manejar errores con objetos `{ error: string }` o null
- [ ] ✅ Crear schemas Zod en `src/schemas/`
- [ ] ✅ Refactorizar endpoints para usar el servicio
- [ ] ✅ (Opcional) Escribir tests para el servicio

---

## Resumen

| Concepto | Antes (sin servicios) | Después (con servicios) |
|----------|----------------------|------------------------|
| **Código** | Mezclado en endpoints | Organizado en capas |
| **Reutilización** | Difícil | Fácil |
| **Testing** | Requiere mocks HTTP | Directo, sin HTTP |
| **Mantenimiento** | Difícil | Fácil |
| **Líneas por endpoint** | 50-100 líneas | 10-20 líneas |

---

## Recursos Adicionales

- Ver ejemplo completo en `src/services/UserService.ts`
- Ver uso en `src/api/user.ts`
- Patrón similar usado por: NestJS, Spring Boot, Laravel
