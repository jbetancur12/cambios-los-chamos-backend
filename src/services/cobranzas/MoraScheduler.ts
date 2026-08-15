import { DI } from '@/di'
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
      this.checkOverdue().catch((err) => {
        logger.error({ err }, 'cobranzas-mora: error en chequeo de mora')
      })
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

  async checkOverdue(): Promise<{ marked: number; checked: number }> {
    const graceDays = Number(process.env.COBRANZAS_MORA_GRACE_DAYS ?? 1)

    const active = await DI.credits.find({ status: CreditStatus.ACTIVE })
    let marked = 0

    for (const credit of active) {
      const expected = await creditService.getExpectedInstallments(credit)
      const completed = await creditService.getCompletedInstallmentsCount(credit)
      if (completed >= expected) {
        continue
      }

      const daysOverdue = await creditService.getDaysOverdue(credit)
      if (daysOverdue >= graceDays) {
        credit.status = CreditStatus.DEFAULTED
        await DI.em.persistAndFlush(credit)
        marked++
        logger.info(
          { creditId: credit.id, client: credit.client.name, daysOverdue },
          'cobranzas-mora: crédito marcado como vencido'
        )
      }
    }

    if (marked > 0) {
      logger.info({ checked: active.length, marked }, 'cobranzas-mora: resumen')
    }

    return { marked, checked: active.length }
  }
}

export const moraScheduler = new MoraScheduler()
