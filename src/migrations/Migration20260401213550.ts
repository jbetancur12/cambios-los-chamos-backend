import { Migration } from '@mikro-orm/migrations';

export class Migration20260401213550 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "giros" add column if not exists "factura_type" varchar(255) null, add column if not exists "factura_customer_identification" varchar(255) null, add column if not exists "factura_mandante_identification" varchar(255) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "giros" drop column "factura_type", drop column "factura_customer_identification", drop column "factura_mandante_identification";`);
  }

}
