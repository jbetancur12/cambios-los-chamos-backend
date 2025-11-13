import { Migration } from '@mikro-orm/migrations';

export class Migration20251113045745 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "minorista_transactions" add column "accumulated_profit" numeric(10,0) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "minorista_transactions" drop column "accumulated_profit";`);
  }

}
