# Estándar de Respuestas API

Este documento define el estándar para todas las respuestas de la API del backend.

## Principios

1. **Consistencia**: Todas las respuestas deben seguir la misma estructura
2. **Claridad**: Los mensajes de error deben ser claros y útiles
3. **Tipado**: Usar TypeScript para garantizar el cumplimiento del estándar
4. **Información suficiente**: Incluir códigos de error para facilitar el debugging

## Estructura Base

Todas las respuestas de la API deben seguir esta estructura:

```typescript
interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    message: string
    code?: string
    details?: any
  }
  meta?: {
    timestamp: string
    requestId?: string
  }
}
```

### Campos

- **success**: `boolean` (requerido)
  - `true`: La operación fue exitosa
  - `false`: La operación falló

- **data**: `T` (opcional)
  - Contiene los datos de la respuesta exitosa
  - Solo presente cuando `success: true`

- **error**: `object` (opcional)
  - Solo presente cuando `success: false`
  - **message**: Descripción legible del error
  - **code**: Código de error para identificación programática
  - **details**: Información adicional sobre el error (ej: campos de validación)

- **meta**: `object` (opcional)
  - Metadatos de la respuesta
  - **timestamp**: Fecha/hora de la respuesta
  - **requestId**: ID único de la petición (útil para debugging)

## Ejemplos de Uso

### 1. Respuesta Exitosa con Datos

```typescript
// Login exitoso
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "fullName": "Juan Pérez",
      "email": "juan@example.com",
      "role": "MINORISTA"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 2. Respuesta Exitosa sin Datos

```typescript
// Logout exitoso
{
  "success": true,
  "data": {
    "message": "Sesión cerrada correctamente"
  }
}
```

### 3. Respuesta Exitosa con Lista

```typescript
// Obtener usuarios
{
  "success": true,
  "data": {
    "users": [
      { "id": 1, "fullName": "Juan Pérez", "email": "juan@example.com" },
      { "id": 2, "fullName": "María García", "email": "maria@example.com" }
    ],
    "pagination": {
      "total": 50,
      "page": 1,
      "pageSize": 10
    }
  }
}
```

### 4. Error de Validación

```typescript
// Campos faltantes
{
  "success": false,
  "error": {
    "message": "Datos de entrada inválidos",
    "code": "VALIDATION_ERROR",
    "details": {
      "fields": [
        { "field": "email", "message": "El email es requerido" },
        { "field": "password", "message": "La contraseña debe tener al menos 6 caracteres" }
      ]
    }
  }
}
```

### 5. Error de Autenticación

```typescript
// Credenciales incorrectas
{
  "success": false,
  "error": {
    "message": "Credenciales inválidas",
    "code": "UNAUTHORIZED"
  }
}
```

### 6. Error de Autorización

```typescript
// Usuario sin permisos
{
  "success": false,
  "error": {
    "message": "No tienes permisos para realizar esta acción",
    "code": "FORBIDDEN"
  }
}
```

### 7. Error de Recurso No Encontrado

```typescript
// Usuario no existe
{
  "success": false,
  "error": {
    "message": "Usuario no encontrado",
    "code": "NOT_FOUND",
    "details": {
      "resource": "User",
      "id": 123
    }
  }
}
```

### 8. Error del Servidor

```typescript
// Error interno
{
  "success": false,
  "error": {
    "message": "Error interno del servidor",
    "code": "INTERNAL_SERVER_ERROR",
    "details": {
      "sentryId": "abc123xyz" // Para reportar a soporte
    }
  }
}
```

### 9. Error de Conflicto

```typescript
// Email ya existe
{
  "success": false,
  "error": {
    "message": "Ya existe un usuario con este email",
    "code": "CONFLICT",
    "details": {
      "field": "email",
      "value": "juan@example.com"
    }
  }
}
```

### 10. Error de Rate Limit

```typescript
// Demasiadas peticiones
{
  "success": false,
  "error": {
    "message": "Demasiadas peticiones. Intenta de nuevo más tarde",
    "code": "RATE_LIMIT_EXCEEDED",
    "details": {
      "retryAfter": 60 // segundos
    }
  }
}
```

## Códigos de Error Estándar

| Código HTTP | Code | Descripción |
|-------------|------|-------------|
| 400 | `VALIDATION_ERROR` | Error de validación de datos de entrada |
| 400 | `BAD_REQUEST` | Petición malformada o inválida |
| 401 | `UNAUTHORIZED` | No autenticado |
| 403 | `FORBIDDEN` | No autorizado (sin permisos) |
| 404 | `NOT_FOUND` | Recurso no encontrado |
| 409 | `CONFLICT` | Conflicto (ej: recurso ya existe) |
| 422 | `UNPROCESSABLE_ENTITY` | Datos válidos pero no procesables |
| 429 | `RATE_LIMIT_EXCEEDED` | Límite de peticiones excedido |
| 500 | `INTERNAL_SERVER_ERROR` | Error interno del servidor |
| 503 | `SERVICE_UNAVAILABLE` | Servicio no disponible |

## Códigos de Error Personalizados

Para errores de negocio específicos:

| Code | Descripción |
|------|-------------|
| `EMAIL_NOT_VERIFIED` | Email no verificado |
| `ACCOUNT_INACTIVE` | Cuenta desactivada |
| `INVALID_TOKEN` | Token inválido o expirado |
| `PASSWORD_MISMATCH` | Las contraseñas no coinciden |
| `INSUFFICIENT_BALANCE` | Saldo insuficiente |
| `TRANSACTION_FAILED` | Error en la transacción |
| `INVALID_EXCHANGE_RATE` | Tasa de cambio inválida |

## Funciones Helper

El sistema provee funciones helper para generar respuestas consistentes:

```typescript
// Respuesta exitosa
ApiResponse.success(data, meta?)

// Respuestas de error
ApiResponse.error(message, code?, details?)
ApiResponse.validationError(fields)
ApiResponse.unauthorized(message?)
ApiResponse.forbidden(message?)
ApiResponse.notFound(resource?, id?)
ApiResponse.conflict(message, details?)
ApiResponse.serverError(error?, sentryId?)
```

## Buenas Prácticas

### 1. Mensajes de Error Claros

```typescript
// ❌ Mal
{ error: { message: "Error" } }

// ✅ Bien
{ error: { message: "El email proporcionado no es válido" } }
```

### 2. Incluir Códigos de Error

```typescript
// ❌ Mal
{ success: false, error: { message: "No autorizado" } }

// ✅ Bien
{
  success: false,
  error: {
    message: "No autorizado",
    code: "UNAUTHORIZED"
  }
}
```

### 3. Proporcionar Detalles Útiles

```typescript
// ❌ Mal
{ error: { message: "Datos inválidos" } }

// ✅ Bien
{
  error: {
    message: "Datos inválidos",
    code: "VALIDATION_ERROR",
    details: {
      fields: [
        { field: "email", message: "Formato de email inválido" }
      ]
    }
  }
}
```

### 4. No Exponer Información Sensible

```typescript
// ❌ Mal - Expone stack trace
{ error: { message: err.stack } }

// ✅ Bien - Mensaje genérico + ID de Sentry
{
  error: {
    message: "Error interno del servidor",
    code: "INTERNAL_SERVER_ERROR",
    details: { sentryId: "abc123" }
  }
}
```

### 5. Consistencia en Nombres de Campos

```typescript
// ❌ Mal - Nombres inconsistentes
{ data: { full_name: "...", Email: "..." } }

// ✅ Bien - camelCase consistente
{ data: { fullName: "...", email: "..." } }
```

## Migración de Código Existente

### Antes
```typescript
// Inconsistente
res.status(400).json({ error: 'Email requerido' })
res.status(200).json({ message: 'Éxito', user: {...} })
res.status(400).json({ success: false, message: 'Error' })
```

### Después
```typescript
// Consistente
res.status(400).json(ApiResponse.validationError([
  { field: 'email', message: 'Email requerido' }
]))

res.status(200).json(ApiResponse.success({ user: {...} }))

res.status(400).json(ApiResponse.error('Error', 'BAD_REQUEST'))
```

## Validación de Respuestas

Todas las respuestas deben:
1. Incluir el campo `success`
2. Si `success: true`, incluir `data`
3. Si `success: false`, incluir `error` con al menos `message`
4. Usar códigos HTTP apropiados
5. Seguir la convención de nombres camelCase
6. No exponer información sensible en producción

## Herramientas de Desarrollo

- **Linting**: El linter verificará que todas las respuestas cumplan el estándar
- **Tests**: Los tests deben validar la estructura de las respuestas
- **Documentación**: Swagger/OpenAPI generará documentación automática basada en estos tipos
