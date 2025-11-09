import { Migration } from '@mikro-orm/migrations';

export class Migration20251109035420_AddDatabaseIndexesForPerformance extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create index "users_role_index" on "users" ("role");`);
    this.addSql(`create index "users_is_active_index" on "users" ("is_active");`);

    this.addSql(`create index "minorista_transactions_created_at_index" on "minorista_transactions" ("created_at");`);

    this.addSql(`create index "giros_status_index" on "giros" ("status");`);
    this.addSql(`create index "giros_created_at_index" on "giros" ("created_at");`);

    this.addSql(`create index "bank_transactions_created_at_index" on "bank_transactions" ("created_at");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index "users_role_index";`);
    this.addSql(`drop index "users_is_active_index";`);

    this.addSql(`drop index "minorista_transactions_created_at_index";`);

    this.addSql(`drop index "giros_status_index";`);
    this.addSql(`drop index "giros_created_at_index";`);

    this.addSql(`drop index "bank_transactions_created_at_index";`);
  }

}
