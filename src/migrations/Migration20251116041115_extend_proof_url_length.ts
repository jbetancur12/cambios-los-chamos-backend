import { Migration } from '@mikro-orm/migrations';

export class Migration20251116041115_extend_proof_url_length extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "giros" alter column "proof_url" type text using ("proof_url"::text);`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "giros" alter column "proof_url" type varchar(255) using ("proof_url"::varchar(255));`);
  }

}
