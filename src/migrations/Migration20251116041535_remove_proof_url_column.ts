import { Migration } from '@mikro-orm/migrations';

export class Migration20251116041535_remove_proof_url_column extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "giros" drop column "proof_url";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "giros" add column "proof_url" text null;`);
  }

}
