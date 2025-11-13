import { Migration } from '@mikro-orm/migrations';

export class Migration20251113011320_AddCreditDetailsToMinoristaTransaction extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "minorista_transactions" add column "giro_id" varchar(255) null, add column "credit_consumed" numeric(10,0) null, add column "profit_earned" numeric(10,0) null, add column "accumulated_debt" numeric(10,0) null, add column "description" varchar(255) null;`);
    this.addSql(`alter table "minorista_transactions" add constraint "minorista_transactions_giro_id_foreign" foreign key ("giro_id") references "giros" ("id") on update cascade on delete restrict;`);
    this.addSql(`alter table "minorista_transactions" add constraint "minorista_transactions_giro_id_unique" unique ("giro_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "minorista_transactions" drop constraint "minorista_transactions_giro_id_foreign";`);

    this.addSql(`alter table "minorista_transactions" drop constraint "minorista_transactions_giro_id_unique";`);
    this.addSql(`alter table "minorista_transactions" drop column "giro_id", drop column "credit_consumed", drop column "profit_earned", drop column "accumulated_debt", drop column "description";`);
  }

}
