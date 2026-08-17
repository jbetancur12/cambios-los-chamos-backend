import { DI } from '@/di'
import { RequestContext } from '@mikro-orm/postgresql'
import { CreditStatus } from '@/entities/Credit'
import { creditService } from './CreditService'
import { logger } from '@/lib/logger'

/**
 * Cron de mora para el módulo de cobranzas.
 * Marca como DEFAULTED los créditos activos que pasaron el día de gracia
 * sin pagar la cuota vencida. Corre al arranque y luego cada 6 horas.
 * Solo el proceso 0 de PM2 ejecuta el cron.
 */
export class MoraScheduler {
  private timer?: NodeJS.Timeout

  start(): void {
    const instance = process.env.NODE_APP_INSTANCE
    if (instance !== undefined && instance !== '0') {
      logger.info({ instance }, 'cobranzas-mora: proceso PM2 distinto de 0, cron desactivado')
      return
    }

    const run = (): void => {
      // Fuera de un request HTTP no hay RequestContext activo. Se crea uno propio
      // para que el EM global y los repos de DI puedan usarse dentro del cron.
      RequestContext.create(DI.orm.em, () =>
        this.checkOverdue().catch((err) => {
          logger.error({ err }, 'cobranzas-mora: error en chequeo de mora')
        })
      )
    }

    run()
    this.timer = setInterval(run, 6 * 60 * 60 * 1000)
    logger.info('cobranzas-mora: cron de mora activado (cada 6h)')
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  async checkOverdue(): Promise<{ marked: number; reverted: number; checked: number }> {
    const graceDays = Number(process.env.COBRANZAS_MORA_GRACE_DAYS ?? 1)

    const relevant = await DI.credits.find({
      status: { $in: [CreditStatus.ACTIVE, CreditStatus.DEFAULTED] },
    })
    let marked = 0
    let reverted = 0

    for (const credit of relevant) {
      const expected = await creditService.getExpectedInstallments(credit)
      const expectedAmount = expected * Number(credit.installmentAmount ?? 0)
      const totalPaid = Number(credit.totalPaid ?? 0)
      const daysOverdue = await creditService.getDaysOverdue(credit)
      // "Al día" = pagó al menos todo lo vencido hasta hoy (robusto a pagos de varias cuotas)
      const isBehind = totalPaid < expectedAmount - 0.001

      if (credit.status === CreditStatus.ACTIVE && isBehind && daysOverdue >= graceDays) {
        credit.status = CreditStatus.DEFAULTED
        await DI.em.persistAndFlush(credit)
        marked++
        logger.info(
          { creditId: credit.id, client: credit.client.name, daysOverdue },
          'cobranzas-mora: crédito marcado como vencido'
        )
      } else if (credit.status === CreditStatus.DEFAULTED && !isBehind) {
        // Se puso al día → vuelve a activo
        credit.status = CreditStatus.ACTIVE
        credit.completedAt = undefined
        await DI.em.persistAndFlush(credit)
        reverted++
        logger.info({ creditId: credit.id, client: credit.client.name }, 'cobranzas-mora: crédito vuelto a activo')
      }
    }

    if (marked > 0 || reverted > 0) {
      logger.info({ checked: relevant.length, marked, reverted }, 'cobranzas-mora: resumen')
    }

    return { marked, reverted, checked: relevant.length }
  }
}

export const moraScheduler = new MoraScheduler()
