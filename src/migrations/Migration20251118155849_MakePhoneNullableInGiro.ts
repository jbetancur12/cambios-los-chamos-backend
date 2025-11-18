import { Migration } from '@mikro-orm/migrations';

export class Migration20251118155849_MakePhoneNullableInGiro extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "giros" alter column "phone" type varchar(255) using ("phone"::varchar(255));`);
    this.addSql(`alter table "giros" alter column "phone" drop not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "giros" alter column "phone" type varchar(255) using ("phone"::varchar(255));`);
    this.addSql(`alter table "giros" alter column "phone" set not null;`);
  }

}
