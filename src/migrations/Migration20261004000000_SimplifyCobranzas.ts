import { Migration } from '@mikro-orm/migrations'

/**
 * Simplifica el módulo de cobranzas: el superadmin presta y cobra.
 * - Sin flujo de aprobación/entrega, sin estado "defaulted" (la mora se calcula).
 * - Sin caja, rutas, categorías, tasas ni frecuencias configurables.
 */
export class Migration20261004000000_SimplifyCobranzas extends Migration {
  override async up(): Promise<void> {
    // ---------------- credits ----------------
    this.addSql(`update "credits" set "status" = 'cancelled' where "status" in ('pending_approval', 'waiting_delivery');`)
    this.addSql(`update "credits" set "status" = 'active' where "status" = 'defaulted';`)
    this.addSql(`alter table "credits" drop constraint if exists "credits_status_check";`)
    this.addSql(
      `alter table "credits" add constraint "credits_status_check" check("status" in ('active', 'paid_off', 'cancelled'));`
    )
    this.addSql(`alter table "credits" alter column "status" set default 'active';`)
    for (const col of [
      'cobrador_id',
      'approved_by_id',
      'delivered_by_id',
      'cash_balance_id',
      'scheduled_delivery_date',
      'approved_at',
      'delivered_at',
      'delivery_notes',
      'rejection_reason',
      'immediate_delivery_requested',
      'is_legacy_credit',
      'is_custom_credit',
      'down_payment',
      'calc_on_remaining_amount',
      'latitude',
      'longitude',
      'first_payment_today',
    ]) {
      this.addSql(`alter table "credits" drop column if exists "${col}" cascade;`)
    }

    // ---------------- payments ----------------
    this.addSql(`update "payments" set "status" = 'cancelled' where "status" in ('pending', 'failed');`)
    this.addSql(`update "payments" set "status" = 'completed' where "status" = 'partial';`)
    this.addSql(`update "payments" set "payment_method" = 'transfer' where "payment_method" = 'card';`)
    this.addSql(`alter table "payments" drop constraint if exists "payments_status_check";`)
    this.addSql(`alter table "payments" drop constraint if exists "payments_payment_method_check";`)
    this.addSql(`alter table "payments" drop constraint if exists "payments_payment_type_check";`)
    this.addSql(
      `alter table "payments" add constraint "payments_status_check" check("status" in ('completed', 'cancelled'));`
    )
    this.addSql(
      `alter table "payments" add constraint "payments_payment_method_check" check("payment_method" in ('cash', 'transfer', 'mobile_payment'));`
    )
    this.addSql(`alter table "payments" alter column "status" set default 'completed';`)
    for (const col of [
      'cobrador_id',
      'cash_balance_id',
      'accumulated_amount',
      'payment_type',
      'latitude',
      'longitude',
      'transaction_id',
      'installment_number',
    ]) {
      this.addSql(`alter table "payments" drop column if exists "${col}" cascade;`)
    }

    // ---------------- cobranza_clients ----------------
    for (const col of [
      'email',
      'category_id',
      'credit_limit_override',
      'max_credits_override',
      'latitude',
      'longitude',
    ]) {
      this.addSql(`alter table "cobranza_clients" drop column if exists "${col}" cascade;`)
    }

    // ---------------- tablas eliminadas ----------------
    this.addSql(`drop table if exists "cobranza_route_clients" cascade;`)
    this.addSql(`drop table if exists "cobranza_routes" cascade;`)
    this.addSql(`drop table if exists "cash_balances" cascade;`)
    this.addSql(`drop table if exists "client_categories" cascade;`)
    this.addSql(`drop table if exists "interest_rates" cascade;`)
    this.addSql(`drop table if exists "loan_frequencies" cascade;`)
  }

  override async down(): Promise<void> {
    throw new Error('Migración irreversible: simplificación del módulo de cobranzas')
  }
}
