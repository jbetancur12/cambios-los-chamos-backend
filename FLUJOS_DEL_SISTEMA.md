# Flujos del Sistema - Cambios Los Chamos

Este documento describe los diferentes flujos de negocio del sistema con sus respectivos casos de auditoría.

---

## 📊 Flujo 1: Minorista Crea un Giro

**Actor**: Usuario con rol MINORISTA
**Objetivo**: Crear un giro para transferir dinero a un beneficiario

### Diagrama de Flujo

```
┌─────────────────┐
│  Minorista      │
│  crea giro      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Validar balance del minorista   │
│ Balance >= amountBs?             │
└────────┬────────────────┬────────┘
         │ SÍ             │ NO
         ▼                ▼
┌──────────────────┐   ┌──────────────────────┐
│ Crear transacción│   │ Error:               │
│ MinoristaTransaction│ │ INSUFFICIENT_BALANCE │
│ tipo: DISCOUNT   │   └──────────────────────┘
│ amount: amountBs │
└────────┬─────────┘
         │
         ▼
┌─────────────────────┐
│ Balance actualizado │
│ previousBalance     │
│ currentBalance      │
│ Registro auditoría  │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Crear Giro          │
│ status: PENDIENTE   │
│ minorista: sí       │
│ transferencista: NO │
└─────────────────────┘
```

### Registros Creados

1. **MinoristaTransaction**
   - type: `DISCOUNT`
   - amount: `amountBs` del giro
   - previousBalance: balance antes del descuento
   - currentBalance: balance después del descuento
   - createdBy: el minorista que creó el giro

2. **Giro**
   - status: `PENDIENTE`
   - minorista: referencia al minorista
   - transferencista: `null` (será asignado después)
   - rateApplied, beneficiaryName, accountNumber, etc.

### Resultado
- Balance del minorista reducido en `amountBs`
- Giro queda en estado PENDIENTE esperando asignación de transferencista

---

## 👨‍💼 Flujo 2: Admin/SuperAdmin Crea un Giro

**Actor**: Usuario con rol ADMIN o SUPER_ADMIN
**Objetivo**: Crear un giro que será ejecutado por un transferencista

### Diagrama de Flujo

```
┌─────────────────┐
│ Admin/SuperAdmin│
│  crea giro      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Buscar asignación activa        │
│ para banco destino              │
│ BankAssignment donde:           │
│ - bank = bankId                 │
│ - isActive = true               │
│ - ordenado por priority DESC    │
└────────┬────────────────┬────────┘
         │ ENCONTRADO     │ NO ENCONTRADO
         ▼                ▼
┌──────────────────┐   ┌────────────────────────┐
│ Transferencista  │   │ Error:                 │
│ available=true?  │   │ NO_TRANSFERENCISTA_    │
└────┬────────┬────┘   │ ASSIGNED               │
  SÍ │        │ NO     └────────────────────────┘
     │        ▼
     │   ┌─────────────────────┐
     │   │ Buscar alternativa  │
     │   │ transferencista con │
     │   │ available=true      │
     │   └──────────┬──────────┘
     │              │
     ▼              ▼
┌───────────────────────────┐
│ Crear Giro                │
│ status: ASIGNADO          │
│ minorista: NO             │
│ transferencista: asignado │
└───────────────────────────┘
```

### Registros Creados

1. **Giro**
   - status: `ASIGNADO`
   - minorista: `null` (no hay minorista involucrado)
   - transferencista: referencia al transferencista asignado
   - rateApplied, beneficiaryName, accountNumber, etc.

### Resultado
- **NO se descuenta balance** en este momento
- Giro queda en estado ASIGNADO esperando que el transferencista lo ejecute
- El descuento se hará de la cuenta bancaria del transferencista al ejecutar

---

## 🔄 Flujo 3: Transferencista Marca Giro en Proceso

**Actor**: Usuario con rol TRANSFERENCISTA
**Objetivo**: Marcar que está trabajando en un giro asignado

### Diagrama de Flujo

```
┌─────────────────┐
│ Transferencista │
│ marca processing│
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│ Validar giro existe         │
│ status = ASIGNADO?          │
└────────┬────────────┬────────┘
         │ SÍ         │ NO
         ▼            ▼
┌──────────────┐   ┌──────────────┐
│ Actualizar   │   │ Error:       │
│ Giro         │   │ INVALID_     │
│ status:      │   │ STATUS       │
│ PROCESANDO   │   └──────────────┘
└──────────────┘
```

### Registros Actualizados

1. **Giro**
   - status: `ASIGNADO` → `PROCESANDO`
   - updatedAt: fecha actual

### Resultado
- Giro marcado como en proceso
- Indica que el transferencista está trabajando en él
- **NO se descuenta balance aún**

---

## ✅ Flujo 4: Transferencista Ejecuta el Giro

**Actor**: Usuario con rol TRANSFERENCISTA
**Objetivo**: Completar el giro transfiriendo desde su cuenta bancaria

### Diagrama de Flujo

```
┌─────────────────┐
│ Transferencista │
│ ejecuta giro    │
│ (selecciona     │
│ cuenta bancaria)│
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│ Validar:                    │
│ - Giro existe               │
│ - status = ASIGNADO o       │
│   PROCESANDO                │
│ - Cuenta bancaria existe    │
│ - Cuenta pertenece al       │
│   transferencista del giro  │
└────────┬────────────────────┘
         │ VÁLIDO
         ▼
┌─────────────────────────────────┐
│ Crear transacción               │
│ BankAccountTransaction          │
│ tipo: WITHDRAWAL                │
│ amount: amountBs del giro       │
│ reference: "Giro {giroId}"      │
└────────┬────────────────┬────────┘
         │ OK             │ ERROR
         ▼                ▼
┌──────────────────┐   ┌──────────────────────┐
│ Balance cuenta   │   │ Error:               │
│ actualizado      │   │ INSUFFICIENT_BALANCE │
│ previousBalance  │   └──────────────────────┘
│ currentBalance   │
└────────┬─────────┘
         │
         ▼
┌─────────────────────┐
│ Actualizar Giro     │
│ status: COMPLETADO  │
│ bankAccountUsed: sí │
│ executionType: tipo │
│ proofUrl: opcional  │
└─────────────────────┘
```

### Registros Creados/Actualizados

1. **BankAccountTransaction**
   - type: `WITHDRAWAL`
   - amount: `amountBs` del giro
   - reference: `"Giro {giroId}"`
   - previousBalance: balance de la cuenta antes del retiro
   - currentBalance: balance de la cuenta después del retiro
   - createdBy: usuario del transferencista

2. **Giro**
   - status: `ASIGNADO`/`PROCESANDO` → `COMPLETADO`
   - bankAccountUsed: cuenta bancaria utilizada
   - executionType: TRANSFERENCIA | PAGO_MOVIL | EFECTIVO | ZELLE | OTROS
   - proofUrl: URL del comprobante (opcional)
   - updatedAt: fecha actual

### Notas Importantes

- **La cuenta bancaria puede ser de cualquier banco** (no necesita coincidir con el banco destino)
- Si se usa cuenta de banco diferente al destino, puede haber comisión
- La comisión se registra en el campo `commission` del Giro
- El transferencista elige qué cuenta usar de las que tiene disponibles

### Resultado
- Balance de la cuenta bancaria del transferencista reducido
- Giro completado con auditoría completa
- Registro del tipo de ejecución y cuenta utilizada

---

## 💰 Flujo 5: Admin Recarga Balance de Minorista

**Actor**: Usuario con rol ADMIN o SUPER_ADMIN
**Objetivo**: Agregar fondos al balance de un minorista

### Diagrama de Flujo

```
┌─────────────────┐
│ Admin/SuperAdmin│
│ crea transacción│
│ tipo: RECHARGE  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│ Validar minorista existe    │
└────────┬────────────┬────────┘
         │ SÍ         │ NO
         ▼            ▼
┌──────────────────┐ ┌──────────────────┐
│ Crear transacción│ │ Error:           │
│ MinoristaTransaction│ │ MINORISTA_    │
│ tipo: RECHARGE   │ │ NOT_FOUND        │
│ amount: monto    │ └──────────────────┘
└────────┬─────────┘
         │
         ▼
┌─────────────────────┐
│ Balance actualizado │
│ previousBalance     │
│ currentBalance =    │
│ previous + amount   │
└─────────────────────┘
```

### Registros Creados

1. **MinoristaTransaction**
   - type: `RECHARGE`
   - amount: monto a recargar
   - previousBalance: balance antes de la recarga
   - currentBalance: balance después de la recarga
   - createdBy: el admin que hizo la recarga

### Resultado
- Balance del minorista incrementado
- Auditoría completa del cambio

---

## 💳 Flujo 6: Admin Recarga Cuenta Bancaria de Transferencista

**Actor**: Usuario con rol ADMIN o SUPER_ADMIN
**Objetivo**: Agregar fondos a una cuenta bancaria de transferencista

### Diagrama de Flujo

```
┌─────────────────┐
│ Admin/SuperAdmin│
│ crea transacción│
│ tipo: DEPOSIT   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│ Validar cuenta existe       │
└────────┬────────────┬────────┘
         │ SÍ         │ NO
         ▼            ▼
┌──────────────────┐ ┌──────────────────────┐
│ Crear transacción│ │ Error:               │
│ BankAccountTransaction│ │ BANK_ACCOUNT_    │
│ tipo: DEPOSIT    │ │ NOT_FOUND            │
│ amount: monto    │ └──────────────────────┘
└────────┬─────────┘
         │
         ▼
┌─────────────────────┐
│ Balance actualizado │
│ previousBalance     │
│ currentBalance =    │
│ previous + amount   │
└─────────────────────┘
```

### Registros Creados

1. **BankAccountTransaction**
   - type: `DEPOSIT`
   - amount: monto a depositar
   - reference: opcional (ej: "Depósito inicial", "Recarga operativa")
   - previousBalance: balance antes del depósito
   - currentBalance: balance después del depósito
   - createdBy: el admin que hizo el depósito

### Resultado
- Balance de la cuenta bancaria incrementado
- Transferencista tiene más fondos para ejecutar giros

---

## 🏦 Flujo 7: Admin Recarga Balance de Banco (Central)

**Actor**: Usuario con rol ADMIN o SUPER_ADMIN
**Objetivo**: Agregar fondos al balance central de un banco

### Diagrama de Flujo

```
┌─────────────────┐
│ Admin/SuperAdmin│
│ crea transacción│
│ tipo: RECHARGE  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│ Validar banco existe        │
└────────┬────────────┬────────┘
         │ SÍ         │ NO
         ▼            ▼
┌──────────────────┐ ┌──────────────┐
│ Crear transacción│ │ Error:       │
│ BankTransaction  │ │ BANK_        │
│ tipo: RECHARGE   │ │ NOT_FOUND    │
│ amount: monto    │ └──────────────┘
│ commission: opc  │
└────────┬─────────┘
         │
         ▼
┌─────────────────────┐
│ Balance actualizado │
│ previousBalance     │
│ currentBalance =    │
│ previous + amount   │
└─────────────────────┘
```

### Registros Creados

1. **BankTransaction**
   - type: `RECHARGE`
   - amount: monto a recargar
   - commission: comisión aplicada (opcional)
   - previousBalance: balance antes de la recarga
   - currentBalance: balance después de la recarga
   - createdBy: el admin que hizo la recarga

### Resultado
- Balance central del banco incrementado
- Usado para tracking de liquidez general

---

## 🔧 Flujo 8: Admin Hace Ajuste de Balance

**Actor**: Usuario con rol ADMIN o SUPER_ADMIN
**Objetivo**: Corregir balances manualmente (positivo o negativo)

### Tipos de Ajustes

#### 8.1 Ajuste de Minorista

```
MinoristaTransaction
├── tipo: ADJUSTMENT
├── amount: puede ser positivo o negativo
├── Valida que balance final >= 0
└── Registra previousBalance y currentBalance
```

#### 8.2 Ajuste de Cuenta Bancaria

```
BankAccountTransaction
├── tipo: ADJUSTMENT
├── amount: puede ser positivo o negativo
├── Valida que balance final >= 0
├── reference: motivo del ajuste
└── Registra previousBalance y currentBalance
```

#### 8.3 Ajuste de Banco Central

```
BankTransaction
├── tipo: ADJUSTMENT
├── amount: puede ser positivo o negativo
├── Valida que balance final >= 0
├── commission: opcional
└── Registra previousBalance y currentBalance
```

### Validación Común
Todos los ajustes validan que el balance resultante no sea negativo:
- `newBalance = previousBalance + amount`
- Si `newBalance < 0` → Error: `INSUFFICIENT_BALANCE`

---

## 🔍 Auditoría Completa

### Todos los flujos crean registros auditables con:

1. **previousBalance**: balance antes de la operación
2. **currentBalance**: balance después de la operación
3. **amount**: monto de la transacción
4. **type**: tipo de operación (RECHARGE, DISCOUNT, WITHDRAWAL, etc.)
5. **createdBy**: usuario que realizó la operación
6. **createdAt**: timestamp de la operación
7. **reference**: referencia opcional (ej: ID del giro)

### Tipos de Transacciones por Entidad

#### MinoristaTransaction
- `RECHARGE`: Recarga de balance
- `DISCOUNT`: Descuento por creación de giro
- `ADJUSTMENT`: Ajuste manual

#### BankAccountTransaction
- `DEPOSIT`: Depósito a cuenta
- `WITHDRAWAL`: Retiro por ejecución de giro
- `ADJUSTMENT`: Ajuste manual

#### BankTransaction
- `RECHARGE`: Recarga de balance central
- `TRANSFER`: Transferencia saliente
- `ADJUSTMENT`: Ajuste manual

---

## 📋 Resumen de Casos de Prueba

### Caso 1: Minorista con saldo suficiente
- ✅ Crea giro
- ✅ Se crea MinoristaTransaction (DISCOUNT)
- ✅ Balance reducido
- ✅ Giro en estado PENDIENTE

### Caso 2: Minorista con saldo insuficiente
- ❌ Error: INSUFFICIENT_BALANCE
- ❌ NO se crea giro
- ❌ NO se crea transacción
- ✅ Balance sin cambios

### Caso 3: Admin crea giro sin transferencista disponible
- ❌ Error: NO_TRANSFERENCISTA_ASSIGNED
- ❌ NO se crea giro
- ✅ Debe configurar BankAssignment primero

### Caso 4: Admin crea giro con transferencista inactivo
- ✅ Busca alternativa activa
- ✅ Si encuentra: asigna ese transferencista
- ❌ Si no encuentra: Error NO_TRANSFERENCISTA_ASSIGNED

### Caso 5: Transferencista ejecuta con cuenta insuficiente
- ❌ Error: INSUFFICIENT_BALANCE
- ❌ NO se completa giro
- ❌ NO se crea BankAccountTransaction
- ✅ Giro mantiene estado PROCESANDO

### Caso 6: Transferencista ejecuta desde cualquier banco
- ✅ Puede usar cuenta de Banco A para giro hacia Banco B
- ✅ Se registra comisión si aplica
- ✅ Se crea BankAccountTransaction (WITHDRAWAL)
- ✅ Giro completado con referencia a cuenta usada

### Caso 7: Recarga administrativa
- ✅ Admin puede recargar minorista, cuenta bancaria, o banco
- ✅ Se crea transacción correspondiente (RECHARGE o DEPOSIT)
- ✅ Balance incrementado
- ✅ Auditoría completa

### Caso 8: Ajuste negativo que deja balance negativo
- ❌ Error: INSUFFICIENT_BALANCE
- ❌ NO se aplica ajuste
- ✅ Balance sin cambios
