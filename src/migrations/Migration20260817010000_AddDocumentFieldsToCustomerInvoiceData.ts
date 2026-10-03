import { Migration } from '@mikro-orm/migrations'

export class Migration20260817010000_AddDocumentFieldsToCustomerInvoiceData extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "customer_invoice_data" add column if not exists "identification_document_id" varchar(255) not null default '3';`
    )
    this.addSql(
      `alter table "customer_invoice_data" add column if not exists "legal_organization_id" varchar(255) not null default '2';`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "customer_invoice_data" drop column "identification_document_id";`)
    this.addSql(`alter table "customer_invoice_data" drop column "legal_organization_id";`)
  }
}
