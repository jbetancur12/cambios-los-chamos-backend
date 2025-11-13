import { Migration } from '@mikro-orm/migrations';

export class Migration20251112230317_AddCreditLimitToMinorista extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "minoristas" add column "credit_limit" numeric(10,0) not null default 0, add column "available_credit" numeric(10,0) not null default 0;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "minoristas" drop column "credit_limit", drop column "available_credit";`);
  }

}
