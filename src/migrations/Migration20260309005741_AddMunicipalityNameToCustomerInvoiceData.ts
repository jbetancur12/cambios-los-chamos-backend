import { Migration } from '@mikro-orm/migrations';

export class Migration20260309005741_AddMunicipalityNameToCustomerInvoiceData extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "customer_invoice_data" add column "municipality_name" varchar(255) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "customer_invoice_data" drop column "municipality_name";`);
  }

}
