import { DI } from '@/di'
import { Giro, GiroStatus, ExecutionType } from '@/entities/Giro'
import { Minorista } from '@/entities/Minorista'
import { CreateGiroInput } from '@/types/giro'
import { User, UserRole } from '@/entities/User'
import { Transferencista } from '@/entities/Transferencista'

export class GiroService {
    /**
     * Encuentra el transferencista asignado para un banco destino específico
     */
    private async findAssignedTransferencista(bankName: string): Promise<Transferencista | null> {
        const assignment = await DI.bankAssignments.findOne(
            {
                destinationBankName: bankName,
                isActive: true
            },
            {
                populate: ['transferencista', 'transferencista.user'],
                orderBy: { priority: 'DESC' }
            }
        )

        if (!assignment) return null

        // Verificar que el transferencista esté disponible
        if (!assignment.transferencista.available) {
            // Buscar otro transferencista activo para este banco
            const alternativeAssignment = await DI.bankAssignments.findOne(
                {
                    destinationBankName: bankName,
                    isActive: true,
                    transferencista: { available: true }
                },
                {
                    populate: ['transferencista', 'transferencista.user'],
                    orderBy: { priority: 'DESC' }
                }
            )
            return alternativeAssignment?.transferencista || null
        }

        return assignment.transferencista
    }

    /**
     * Crea un giro. El origen del saldo depende de quién lo crea:
     * - Minorista: descuenta de su balance (requiere minoristaId)
     * - Admin/SuperAdmin: asigna transferencista (descuento será al ejecutar, NO requiere minoristaId)
     */
    async createGiro(
        data: CreateGiroInput,
        createdBy: User
    ): Promise<Giro | { error: 'MINORISTA_NOT_FOUND' | 'NO_TRANSFERENCISTA_ASSIGNED' | 'INSUFFICIENT_BALANCE' }> {
        const giroRepo = DI.em.getRepository(Giro)

        let minorista: Minorista | undefined = undefined
        let transferencista: Transferencista | undefined = undefined
        let status = GiroStatus.PENDIENTE
        const entitiesToFlush: (Giro | Minorista)[] = []

        // Determinar origen del saldo según rol del creador
        if (createdBy.role === UserRole.MINORISTA) {
            // Minorista: requiere minoristaId, verificar y descontar su balance
            if (!data.minoristaId) {
                return { error: 'MINORISTA_NOT_FOUND' }
            }

            const minoristaRepo = DI.em.getRepository(Minorista)
            const foundMinorista = await minoristaRepo.findOne(
                { id: data.minoristaId },
                { populate: ['user'] }
            )

            if (!foundMinorista) {
                return { error: 'MINORISTA_NOT_FOUND' }
            }

            if (foundMinorista.balance < data.amountBs) {
                return { error: 'INSUFFICIENT_BALANCE' }
            }

            foundMinorista.balance -= data.amountBs
            minorista = foundMinorista
            status = GiroStatus.PENDIENTE
            entitiesToFlush.push(minorista)
        } else if (createdBy.role === UserRole.ADMIN || createdBy.role === UserRole.SUPER_ADMIN) {
            // Admin/SuperAdmin: NO requiere minorista, asignar transferencista basado en banco destino
            // El dinero se descontará de la cuenta del transferencista cuando ejecute el giro
            const assigned = await this.findAssignedTransferencista(data.bankName)
            if (!assigned) {
                return { error: 'NO_TRANSFERENCISTA_ASSIGNED' }
            }
            transferencista = assigned
            status = GiroStatus.ASIGNADO
        }

        // Crear giro
        const giro = giroRepo.create({
            minorista,  // Puede ser undefined para admin/superadmin
            transferencista,
            beneficiaryName: data.beneficiaryName,
            beneficiaryId: data.beneficiaryId,
            bankName: data.bankName,
            accountNumber: data.accountNumber,
            phone: data.phone,
            rateApplied: data.rateApplied,
            amountInput: data.amountInput,
            currencyInput: data.currencyInput,
            amountBs: data.amountBs,
            bcvValueApplied: data.rateApplied.bcvValue,
            status,
            createdBy,
            createdAt: new Date(),
            updatedAt: new Date()
        })

        entitiesToFlush.push(giro)
        await DI.em.persistAndFlush(entitiesToFlush)

        return giro
    }

    /**
     * Ejecuta un giro. El transferencista selecciona cuenta y tipo de ejecución.
     * Valida balance y descuenta de la cuenta del transferencista.
     */
    async executeGiro(
        giroId: string,
        bankAccountId: string,
        executionType: ExecutionType,
        proofUrl?: string
    ): Promise<Giro | { error: 'GIRO_NOT_FOUND' | 'INVALID_STATUS' | 'BANK_ACCOUNT_NOT_FOUND' | 'INSUFFICIENT_BALANCE' | 'UNAUTHORIZED_ACCOUNT' }> {
        const giro = await DI.giros.findOne(
            { id: giroId },
            { populate: ['transferencista', 'minorista'] }
        )

        if (!giro) {
            return { error: 'GIRO_NOT_FOUND' }
        }

        // Solo giros ASIGNADOS o PROCESANDO pueden ejecutarse
        if (giro.status !== GiroStatus.ASIGNADO && giro.status !== GiroStatus.PROCESANDO) {
            return { error: 'INVALID_STATUS' }
        }

        const bankAccount = await DI.bankAccounts.findOne(
            { id: bankAccountId },
            { populate: ['transferencista', 'bank'] }
        )

        if (!bankAccount) {
            return { error: 'BANK_ACCOUNT_NOT_FOUND' }
        }

        // Verificar que la cuenta pertenezca al transferencista del giro
        if (giro.transferencista?.id !== bankAccount.transferencista.id) {
            return { error: 'UNAUTHORIZED_ACCOUNT' }
        }

        // Verificar balance suficiente
        if (bankAccount.balance < giro.amountBs) {
            return { error: 'INSUFFICIENT_BALANCE' }
        }

        // Descontar de cuenta del transferencista
        bankAccount.balance -= giro.amountBs

        // Actualizar giro
        giro.bankAccountUsed = bankAccount
        giro.executionType = executionType
        giro.status = GiroStatus.COMPLETADO
        if (proofUrl) {
            giro.proofUrl = proofUrl
        }
        giro.updatedAt = new Date()

        await DI.em.persistAndFlush([giro, bankAccount])

        return giro
    }

    /**
     * Permite al transferencista marcar un giro como en proceso
     */
    async markAsProcessing(giroId: string): Promise<Giro | { error: 'GIRO_NOT_FOUND' | 'INVALID_STATUS' }> {
        const giro = await DI.giros.findOne({ id: giroId })

        if (!giro) {
            return { error: 'GIRO_NOT_FOUND' }
        }

        if (giro.status !== GiroStatus.ASIGNADO) {
            return { error: 'INVALID_STATUS' }
        }

        giro.status = GiroStatus.PROCESANDO
        giro.updatedAt = new Date()

        await DI.em.persistAndFlush(giro)

        return giro
    }
}

export const giroService = new GiroService()
