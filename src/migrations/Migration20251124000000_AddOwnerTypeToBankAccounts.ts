import { Migration } from '@mikro-orm/migrations';

export class Migration20251124000000_AddOwnerTypeToBankAccounts extends Migration {

  override async up(): Promise<void> {
    // Add columns for owner type and owner id
    this.addSql(`alter table "bank_accounts" add column "owner_type" varchar(255) not null default 'TRANSFERENCISTA';`);
    this.addSql(`alter table "bank_accounts" add column "owner_id" varchar(255) null;`);

    // Add created_at and updated_at columns
    this.addSql(`alter table "bank_accounts" add column "created_at" timestamp not null default now();`);
    this.addSql(`alter table "bank_accounts" add column "updated_at" timestamp not null default now();`);

    // Make transferencista_id nullable to allow ADMIN accounts (without transferencista reference)
    this.addSql(`alter table "bank_accounts" alter column "transferencista_id" drop not null;`);

    // Populate owner_id with existing transferencista_id values
    this.addSql(`update "bank_accounts" set "owner_id" = "transferencista_id" where "owner_type" = 'TRANSFERENCISTA';`);

    // Create indexes
    this.addSql(`create index "bank_accounts_owner_type_index" on "bank_accounts" using BTREE ("owner_type");`);
    this.addSql(`create index "bank_accounts_owner_id_index" on "bank_accounts" using BTREE ("owner_id");`);
  }

  override async down(): Promise<void> {
    // Drop indexes
    this.addSql(`drop index if exists "bank_accounts_owner_type_index";`);
    this.addSql(`drop index if exists "bank_accounts_owner_id_index";`);

    // Remove columns
    this.addSql(`alter table "bank_accounts" drop column if exists "owner_type";`);
    this.addSql(`alter table "bank_accounts" drop column if exists "owner_id";`);
    this.addSql(`alter table "bank_accounts" drop column if exists "created_at";`);
    this.addSql(`alter table "bank_accounts" drop column if exists "updated_at";`);

    // Make transferencista_id not null again
    this.addSql(`alter table "bank_accounts" alter column "transferencista_id" set not null;`);
  }

}
