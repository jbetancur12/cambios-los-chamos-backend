import { Migration } from '@mikro-orm/migrations'

export class Migration20260814000000_CobranzasModule extends Migration {
  override async up(): Promise<void> {
    // ---------------- client_categories ----------------
    this.addSql(
      `create table if not exists "client_categories" ("id" varchar(255) not null, "code" varchar(255) not null, "name" varchar(255) not null, "description" text null, "is_active" boolean not null default true, "min_overdue_count" int null, "max_overdue_count" int null, "max_amount" numeric(12,2) null, "min_amount" numeric(12,2) not null default 0, "max_credits" int null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "client_categories_pkey" primary key ("id"));`
    )
    this.addSql(`create index "client_categories_code_index" on "client_categories" ("code");`)
    this.addSql(`create index "client_categories_is_active_index" on "client_categories" ("is_active");`)

    // ---------------- interest_rates ----------------
    this.addSql(
      `create table if not exists "interest_rates" ("id" varchar(255) not null, "name" varchar(255) null, "rate" numeric(5,2) not null, "is_active" boolean not null default true, "created_by_id" varchar(255) null, "updated_by_id" varchar(255) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "interest_rates_pkey" primary key ("id"));`
    )
    this.addSql(`create index "interest_rates_is_active_index" on "interest_rates" ("is_active");`)
    this.addSql(
      `alter table "interest_rates" add constraint "interest_rates_created_by_id_foreign" foreign key ("created_by_id") references "users" ("id") on delete set null on update cascade;`
    )
    this.addSql(
      `alter table "interest_rates" add constraint "interest_rates_updated_by_id_foreign" foreign key ("updated_by_id") references "users" ("id") on delete set null on update cascade;`
    )

    // ---------------- loan_frequencies ----------------
    this.addSql(
      `create table if not exists "loan_frequencies" ("id" varchar(255) not null, "code" varchar(255) not null, "name" varchar(255) not null, "description" text null, "is_enabled" boolean not null default true, "is_fixed_duration" boolean not null default false, "fixed_installments" int null, "fixed_duration_days" int null, "period_days" int not null, "default_installments" int null, "min_installments" int null, "max_installments" int null, "interest_rate" numeric(5,2) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "loan_frequencies_pkey" primary key ("id"));`
    )
    this.addSql(`create index "loan_frequencies_code_index" on "loan_frequencies" ("code");`)
    this.addSql(`create index "loan_frequencies_is_enabled_index" on "loan_frequencies" ("is_enabled");`)

    // ---------------- cobranza_clients ----------------
    this.addSql(
      `create table if not exists "cobranza_clients" ("id" varchar(255) not null, "name" varchar(255) not null, "identification" varchar(255) not null, "phone" varchar(255) null, "email" varchar(255) null, "address" varchar(255) null, "category_id" varchar(255) null, "credit_limit_override" numeric(12,2) null, "max_credits_override" int null, "latitude" numeric(10,8) null, "longitude" numeric(11,8) null, "is_active" boolean not null default true, "notes" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "cobranza_clients_pkey" primary key ("id"));`
    )
    this.addSql(`create index "cobranza_clients_identification_index" on "cobranza_clients" ("identification");`)
    this.addSql(`create index "cobranza_clients_is_active_index" on "cobranza_clients" ("is_active");`)
    this.addSql(
      `alter table "cobranza_clients" add constraint "cobranza_clients_category_id_foreign" foreign key ("category_id") references "client_categories" ("id") on delete set null on update cascade;`
    )

    // ---------------- cobranza_routes ----------------
    this.addSql(
      `create table if not exists "cobranza_routes" ("id" varchar(255) not null, "name" varchar(255) not null, "description" text null, "cobrador_id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "cobranza_routes_pkey" primary key ("id"));`
    )
    this.addSql(
      `alter table "cobranza_routes" add constraint "cobranza_routes_cobrador_id_foreign" foreign key ("cobrador_id") references "users" ("id") on delete cascade on update cascade;`
    )

    // ---------------- cobranza_route_clients (pivot) ----------------
    this.addSql(
      `create table if not exists "cobranza_route_clients" ("cobranza_client_id" varchar(255) not null, "cobranza_route_id" varchar(255) not null, constraint "cobranza_route_clients_pkey" primary key ("cobranza_client_id", "cobranza_route_id"));`
    )
    this.addSql(
      `alter table "cobranza_route_clients" add constraint "cobranza_route_clients_cobranza_client_id_foreign" foreign key ("cobranza_client_id") references "cobranza_clients" ("id") on delete cascade on update cascade;`
    )
    this.addSql(
      `alter table "cobranza_route_clients" add constraint "cobranza_route_clients_cobranza_route_id_foreign" foreign key ("cobranza_route_id") references "cobranza_routes" ("id") on delete cascade on update cascade;`
    )

    // ---------------- cash_balances ----------------
    this.addSql(
      `create table if not exists "cash_balances" ("id" varchar(255) not null, "cobrador_id" varchar(255) not null, "date" date not null, "initial_amount" numeric(15,2) not null default 0, "collected_amount" numeric(15,2) not null default 0, "lent_amount" numeric(15,2) not null default 0, "final_amount" numeric(15,2) not null default 0, "status" text not null default 'open', "auto_closed_at" timestamptz null, "manually_closed_at" timestamptz null, "closed_by_id" varchar(255) null, "closure_notes" text null, "requires_reconciliation" boolean not null default false, "has_pending_previous_boxes" boolean not null default false, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "cash_balances_pkey" primary key ("id"));`
    )
    this.addSql(
      `alter table "cash_balances" add constraint "cash_balances_cobrador_id_date_unique" unique ("cobrador_id", "date");`
    )
    this.addSql(
      `alter table "cash_balances" add constraint "cash_balances_cobrador_id_foreign" foreign key ("cobrador_id") references "users" ("id") on delete cascade on update cascade;`
    )
    this.addSql(`create index "cash_balances_date_index" on "cash_balances" ("date");`)
    this.addSql(
      `alter table "cash_balances" add constraint "cash_balances_closed_by_id_foreign" foreign key ("closed_by_id") references "users" ("id") on delete set null on update cascade;`
    )

    // ---------------- credits ----------------
    this.addSql(
      `create table if not exists "credits" ("id" varchar(255) not null, "client_id" varchar(255) not null, "cobrador_id" varchar(255) null, "created_by_id" varchar(255) not null, "approved_by_id" varchar(255) null, "delivered_by_id" varchar(255) null, "cash_balance_id" varchar(255) null, "amount" numeric(15,2) not null, "balance" numeric(15,2) not null, "frequency" text not null, "start_date" date not null, "end_date" date null, "status" text not null default 'pending_approval', "interest_rate" numeric(5,2) not null default 0, "total_amount" numeric(12,2) null, "installment_amount" numeric(10,2) null, "total_installments" int null, "paid_installments_count" int not null default 0, "total_paid" numeric(12,2) not null default 0, "scheduled_delivery_date" timestamptz null, "approved_at" timestamptz null, "delivered_at" timestamptz null, "delivery_notes" text null, "rejection_reason" text null, "immediate_delivery_requested" boolean not null default false, "is_legacy_credit" boolean not null default false, "is_custom_credit" boolean not null default false, "description" text null, "down_payment" numeric(12,2) null, "calc_on_remaining_amount" boolean not null default false, "latitude" numeric(10,8) null, "longitude" numeric(11,8) null, "first_payment_today" boolean not null default false, "completed_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "credits_pkey" primary key ("id"));`
    )
    this.addSql(
      `alter table "credits" add constraint "credits_client_id_foreign" foreign key ("client_id") references "cobranza_clients" ("id") on delete cascade on update cascade;`
    )
    this.addSql(
      `alter table "credits" add constraint "credits_cobrador_id_foreign" foreign key ("cobrador_id") references "users" ("id") on delete set null on update cascade;`
    )
    this.addSql(
      `alter table "credits" add constraint "credits_created_by_id_foreign" foreign key ("created_by_id") references "users" ("id") on delete cascade on update cascade;`
    )
    this.addSql(
      `alter table "credits" add constraint "credits_approved_by_id_foreign" foreign key ("approved_by_id") references "users" ("id") on delete set null on update cascade;`
    )
    this.addSql(
      `alter table "credits" add constraint "credits_delivered_by_id_foreign" foreign key ("delivered_by_id") references "users" ("id") on delete set null on update cascade;`
    )
    this.addSql(
      `alter table "credits" add constraint "credits_cash_balance_id_foreign" foreign key ("cash_balance_id") references "cash_balances" ("id") on delete set null on update cascade;`
    )
    this.addSql(`create index "credits_frequency_index" on "credits" ("frequency");`)
    this.addSql(`create index "credits_status_index" on "credits" ("status");`)
    this.addSql(`create index "credits_start_date_index" on "credits" ("start_date");`)

    // ---------------- payments ----------------
    this.addSql(
      `create table if not exists "payments" ("id" varchar(255) not null, "credit_id" varchar(255) not null, "client_id" varchar(255) not null, "cobrador_id" varchar(255) null, "cash_balance_id" varchar(255) null, "amount" numeric(15,2) not null, "accumulated_amount" numeric(10,2) null, "payment_date" timestamptz not null, "payment_method" text not null, "payment_type" text not null default 'regular', "latitude" numeric(10,8) null, "longitude" numeric(11,8) null, "status" text not null default 'pending', "transaction_id" varchar(255) null, "installment_number" int null, "received_by_id" varchar(255) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "payments_pkey" primary key ("id"));`
    )
    this.addSql(
      `alter table "payments" add constraint "payments_credit_id_foreign" foreign key ("credit_id") references "credits" ("id") on delete cascade on update cascade;`
    )
    this.addSql(
      `alter table "payments" add constraint "payments_client_id_foreign" foreign key ("client_id") references "cobranza_clients" ("id") on delete cascade on update cascade;`
    )
    this.addSql(
      `alter table "payments" add constraint "payments_cobrador_id_foreign" foreign key ("cobrador_id") references "users" ("id") on delete set null on update cascade;`
    )
    this.addSql(
      `alter table "payments" add constraint "payments_cash_balance_id_foreign" foreign key ("cash_balance_id") references "cash_balances" ("id") on delete set null on update cascade;`
    )
    this.addSql(
      `alter table "payments" add constraint "payments_received_by_id_foreign" foreign key ("received_by_id") references "users" ("id") on delete set null on update cascade;`
    )
    this.addSql(`create index "payments_payment_date_index" on "payments" ("payment_date");`)

    // ---------------- enum check constraints ----------------
    this.addSql(
      `alter table "credits" add constraint "credits_frequency_check" check("frequency" in ('daily', 'weekly', 'biweekly', 'monthly'));`
    )
    this.addSql(
      `alter table "credits" add constraint "credits_status_check" check("status" in ('pending_approval', 'waiting_delivery', 'active', 'paid_off', 'defaulted', 'cancelled'));`
    )
    this.addSql(
      `alter table "payments" add constraint "payments_payment_method_check" check("payment_method" in ('cash', 'transfer', 'card', 'mobile_payment'));`
    )
    this.addSql(
      `alter table "payments" add constraint "payments_payment_type_check" check("payment_type" in ('regular', 'down_payment', 'extra'));`
    )
    this.addSql(
      `alter table "payments" add constraint "payments_status_check" check("status" in ('pending', 'completed', 'failed', 'cancelled', 'partial'));`
    )
    this.addSql(
      `alter table "cash_balances" add constraint "cash_balances_status_check" check("status" in ('open', 'closed'));`
    )

    // ---------------- seed data ----------------
    this.addSql(
      `insert into "client_categories" ("id", "code", "name", "description", "min_amount", "max_amount", "max_credits", "created_at", "updated_at") values
        ('00000000-0000-0000-0000-000000000001', 'A', 'Categoría A', 'Clientes preferentes', 0, 1000, 3, now(), now()),
        ('00000000-0000-0000-0000-000000000002', 'B', 'Categoría B', 'Clientes estándar', 0, 500, 2, now(), now()),
        ('00000000-0000-0000-0000-000000000003', 'C', 'Categoría C', 'Clientes nuevos', 0, 200, 1, now(), now()) on conflict do nothing;`
    )
    this.addSql(
      `insert into "loan_frequencies" ("id", "code", "name", "description", "is_enabled", "is_fixed_duration", "fixed_installments", "fixed_duration_days", "period_days", "default_installments", "min_installments", "max_installments", "created_at", "updated_at") values
        ('10000000-0000-0000-0000-000000000001', 'daily', 'Diario', 'Pago diario', true, true, 24, 28, 1, 24, 1, 60, now(), now()),
        ('10000000-0000-0000-0000-000000000002', 'weekly', 'Semanal', 'Pago semanal', true, false, null, null, 7, 8, 2, 24, now(), now()),
        ('10000000-0000-0000-0000-000000000003', 'biweekly', 'Quincenal', 'Pago quincenal', true, false, null, null, 15, 4, 1, 12, now(), now()),
        ('10000000-0000-0000-0000-000000000004', 'monthly', 'Mensual', 'Pago mensual', true, false, null, null, 30, 3, 1, 12, now(), now()) on conflict do nothing;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "payments" cascade;`)
    this.addSql(`drop table if exists "credits" cascade;`)
    this.addSql(`drop table if exists "cash_balances" cascade;`)
    this.addSql(`drop table if exists "cobranza_route_clients" cascade;`)
    this.addSql(`drop table if exists "cobranza_routes" cascade;`)
    this.addSql(`drop table if exists "cobranza_clients" cascade;`)
    this.addSql(`drop table if exists "loan_frequencies" cascade;`)
    this.addSql(`drop table if exists "interest_rates" cascade;`)
    this.addSql(`drop table if exists "client_categories" cascade;`)
  }
}
