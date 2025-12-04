import { Migration } from '@mikro-orm/migrations';

export class Migration20251204142057 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "recharge_operators" add column "code" int not null default 0;`);

    this.addSql(`alter table "giros" add column "bank_code" int not null default 0;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "recharge_operators" drop column "code";`);

    this.addSql(`alter table "giros" drop column "bank_code";`);
  }

}
