# scripts-archivo

Scripts puntuales (correcciones de saldos por usuario, auditorias, pruebas de login, utilidades de
depuracion). Se guardan por historial y **no forman parte del build**: viven fuera de `src/`, asi que
`npm run build` no los compila.

Se ejecutan desde `backend/`, por ejemplo:

```bash
npx ts-node scripts-archivo/<nombre>.ts
```

Casi todos escriben en la base de datos configurada en `.env`. Leer el script antes de ejecutarlo y no
correrlo contra produccion sin revisar a que usuario o saldo afecta.

Los scripts de uso general siguen en `src/scripts`: `createSuperAdmin.ts`, `reconcileBalances.ts` y
`cleanupMobilePaymentSuggestions.ts`.
