import { User, UserRole } from '../entities/User'
import { BankAccount, BankAccountOwnerType } from '../entities/BankAccount'

/**
 * Verifica si un usuario puede acceder a una cuenta bancaria (leer, ver detalles)
 */
export const canAccessBankAccount = (bankAccount: BankAccount, user: User): boolean => {
  // Admin/SuperAdmin pueden acceder a todas las cuentas
  if ([UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(user.role)) {
    return true
  }

  // Si es cuenta de Transferencista (sistema nuevo)
  if (bankAccount.ownerType === BankAccountOwnerType.TRANSFERENCISTA) {
    // Solo el transferencista propietario puede acceder
    if (user.role === UserRole.TRANSFERENCISTA) {
      const transferencista = user.transferencista
      return transferencista?.id === bankAccount.ownerId
    }
    return false
  }

  // Si es cuenta de Transferencista (sistema viejo - relación directa)
  if (bankAccount.transferencista && user.role === UserRole.TRANSFERENCISTA) {
    const transferencista = user.transferencista
    return transferencista?.id === bankAccount.transferencista.id
  }

  // Si es cuenta ADMIN compartida, solo Admin/SuperAdmin pueden acceder
  if (bankAccount.ownerType === BankAccountOwnerType.ADMIN) {
    return [UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(user.role)
  }

  return false
}

/**
 * Verifica si un usuario puede ejecutar un giro usando una cuenta bancaria específica
 */
export const canExecuteGiroWithAccount = (bankAccount: BankAccount, executingUser: User): boolean => {
  // Si es cuenta de Transferencista (sistema nuevo)
  if (bankAccount.ownerType === BankAccountOwnerType.TRANSFERENCISTA) {
    // Solo el transferencista propietario puede ejecutar con esta cuenta
    if (executingUser.role !== UserRole.TRANSFERENCISTA) {
      return false
    }

    const transferencista = executingUser.transferencista
    if (!transferencista || transferencista.id !== bankAccount.ownerId) {
      return false
    }

    return true
  }

  // Si es cuenta de Transferencista (sistema viejo - relación directa)
  if (bankAccount.transferencista) {
    if (executingUser.role !== UserRole.TRANSFERENCISTA) {
      return false
    }

    const transferencista = executingUser.transferencista
    if (!transferencista || transferencista.id !== bankAccount.transferencista.id) {
      return false
    }

    return true
  }

  // Si es cuenta ADMIN compartida
  if (bankAccount.ownerType === BankAccountOwnerType.ADMIN) {
    // Solo ADMIN y SUPERADMIN pueden ejecutar giros con esta cuenta
    return [UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(executingUser.role)
  }

  return false
}

/**
 * Verifica si un usuario puede crear/editar cuentas bancarias
 */
export const canManageBankAccounts = (user: User): boolean => {
  // Solo Admin y SuperAdmin pueden crear/editar cuentas
  return [UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(user.role)
}
