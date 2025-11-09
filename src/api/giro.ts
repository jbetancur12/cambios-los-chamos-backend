import express, { Request, Response } from 'express'
import { requireAuth, requireRole } from '@/middleware/authMiddleware'
import { UserRole } from '@/entities/User'
import { ApiResponse } from '@/lib/apiResponse'
import { validateBody } from '@/lib/zodUtils'
import { createGiroSchema } from '@/schemas/giroSchema'
import { giroService } from '@/services/GiroService'
import { DI } from '@/di'


export const giroRouter = express.Router({ mergeParams: true })

// ------------------ CREAR GIRO ------------------
giroRouter.post('/create', requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MINORISTA), validateBody(createGiroSchema), async (req: Request, res: Response) => {
    const user = req.context?.requestUser?.user
    if (!user) {
        return res.status(401).json(ApiResponse.unauthorized())
    }

    const { beneficiaryName, beneficiaryId, bankName, accountNumber, phone, amountInput, currencyInput, rateAppliedId, amountBs } = req.body

    // Determinar minoristaId según rol
    let finalMinoristaId: string | undefined
    if (user.role === UserRole.MINORISTA) {
        // Minorista: buscar el minorista asociado al usuario
        const minorista = await DI.minoristas.findOne({ user: user.id })
        if (!minorista) {
            return res.status(400).json(ApiResponse.notFound('Minorista'))
        }
        finalMinoristaId = minorista.id
    }
    // Admin/SuperAdmin: NO requieren minoristaId
    // El giro se asignará directamente a un transferencista y el dinero saldrá de su cuenta

    // Obtener la tasa de cambio
    const rateApplied = await DI.exchangeRates.findOne({ id: rateAppliedId })
    if (!rateApplied) {
        return res.status(404).json(ApiResponse.notFound('Tasa de cambio', rateAppliedId))
    }

    const result = await giroService.createGiro({
        minoristaId: finalMinoristaId,
        beneficiaryName,
        beneficiaryId,
        bankName,
        accountNumber,
        phone,
        amountInput,
        currencyInput,
        amountBs,
        rateApplied
    }, user)

    if ('error' in result) {
        switch (result.error) {
            case 'MINORISTA_NOT_FOUND':
                return res.status(404).json(ApiResponse.notFound('Minorista'))
            case 'INSUFFICIENT_BALANCE':
                return res.status(400).json(ApiResponse.badRequest('Balance insuficiente'))
            case 'NO_TRANSFERENCISTA_ASSIGNED':
                return res.status(400).json(ApiResponse.badRequest('No hay transferencista asignado para este banco'))
        }
    }

    res.json(ApiResponse.success({ giro: result, message: 'Giro creado exitosamente' }))
})

// ------------------ OBTENER GIRO ------------------
giroRouter.get('/:giroId', requireAuth(), async (req: Request, res: Response) => {
    const { giroId } = req.params
    // Lógica para obtener un giro por ID
    res.json(ApiResponse.success({ message: `Giro ${giroId} obtenido exitosamente` }))
})

// ------------------ MARCAR GIRO COMO PROCESANDO ------------------
giroRouter.post('/:giroId/mark-processing', requireRole(UserRole.TRANSFERENCISTA), async (req: Request, res: Response) => {
    const { giroId } = req.params

    const result = await giroService.markAsProcessing(giroId)

    if ('error' in result) {
        switch (result.error) {
            case 'GIRO_NOT_FOUND':
                return res.status(404).json(ApiResponse.notFound('Giro', giroId))
            case 'INVALID_STATUS':
                return res.status(400).json(ApiResponse.badRequest('El giro no está en estado válido para ser procesado'))
        }
    }

    res.json(ApiResponse.success({ giro: result, message: 'Giro marcado como procesando' }))
})

// ------------------ EJECUTAR GIRO ------------------
giroRouter.post('/:giroId/execute', requireRole(UserRole.TRANSFERENCISTA), async (req: Request, res: Response) => {
    const { giroId } = req.params
    const { bankAccountId, executionType, proofUrl } = req.body

    if (!bankAccountId || !executionType) {
        return res.status(400).json(ApiResponse.validationError([
            { field: 'bankAccountId', message: 'La cuenta bancaria es requerida' },
            { field: 'executionType', message: 'El tipo de ejecución es requerido' }
        ]))
    }

    const result = await giroService.executeGiro(giroId, bankAccountId, executionType, proofUrl)

    if ('error' in result) {
        switch (result.error) {
            case 'GIRO_NOT_FOUND':
                return res.status(404).json(ApiResponse.notFound('Giro', giroId))
            case 'INVALID_STATUS':
                return res.status(400).json(ApiResponse.badRequest('El giro no está en estado válido para ser ejecutado'))
            case 'BANK_ACCOUNT_NOT_FOUND':
                return res.status(404).json(ApiResponse.notFound('Cuenta bancaria', bankAccountId))
            case 'INSUFFICIENT_BALANCE':
                return res.status(400).json(ApiResponse.badRequest('Balance insuficiente en la cuenta bancaria'))
            case 'UNAUTHORIZED_ACCOUNT':
                return res.status(403).json(ApiResponse.forbidden('La cuenta bancaria no pertenece al transferencista asignado'))
        }
    }

    res.json(ApiResponse.success({ giro: result, message: 'Giro ejecutado exitosamente' }))
})