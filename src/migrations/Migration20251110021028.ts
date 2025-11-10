import { Migration } from '@mikro-orm/migrations';

export class Migration20251110021028 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "transferencistas" drop constraint "transferencistas_user_id_foreign";`);

    this.addSql(`alter table "bank_assignments" drop constraint "bank_assignments_transferencista_id_foreign";`);

    this.addSql(`alter table "bank_accounts" drop constraint "bank_accounts_transferencista_id_foreign";`);

    this.addSql(`alter table "minoristas" drop constraint "minoristas_user_id_foreign";`);

    this.addSql(`alter table "minorista_transactions" drop constraint "minorista_transactions_minorista_id_foreign";`);

    this.addSql(`alter table "giros" drop constraint "giros_minorista_id_foreign";`);
    this.addSql(`alter table "giros" drop constraint "giros_transferencista_id_foreign";`);
    this.addSql(`alter table "giros" drop constraint "giros_bank_account_used_id_foreign";`);

    this.addSql(`alter table "bank_account_transactions" drop constraint "bank_account_transactions_bank_account_id_foreign";`);

    this.addSql(`alter table "user_tokens" drop constraint "user_tokens_user_id_foreign";`);

    this.addSql(`alter table "transferencistas" add constraint "transferencistas_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "bank_assignments" add constraint "bank_assignments_transferencista_id_foreign" foreign key ("transferencista_id") references "transferencistas" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "bank_accounts" add constraint "bank_accounts_transferencista_id_foreign" foreign key ("transferencista_id") references "transferencistas" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "minoristas" add constraint "minoristas_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "minorista_transactions" add constraint "minorista_transactions_minorista_id_foreign" foreign key ("minorista_id") references "minoristas" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "giros" add constraint "giros_minorista_id_foreign" foreign key ("minorista_id") references "minoristas" ("id") on update cascade on delete restrict;`);
    this.addSql(`alter table "giros" add constraint "giros_transferencista_id_foreign" foreign key ("transferencista_id") references "transferencistas" ("id") on update cascade on delete restrict;`);
    this.addSql(`alter table "giros" add constraint "giros_bank_account_used_id_foreign" foreign key ("bank_account_used_id") references "bank_accounts" ("id") on update cascade on delete restrict;`);

    this.addSql(`alter table "bank_account_transactions" add constraint "bank_account_transactions_bank_account_id_foreign" foreign key ("bank_account_id") references "bank_accounts" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "user_tokens" add constraint "user_tokens_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "transferencistas" drop constraint "transferencistas_user_id_foreign";`);

    this.addSql(`alter table "bank_assignments" drop constraint "bank_assignments_transferencista_id_foreign";`);

    this.addSql(`alter table "bank_accounts" drop constraint "bank_accounts_transferencista_id_foreign";`);

    this.addSql(`alter table "minoristas" drop constraint "minoristas_user_id_foreign";`);

    this.addSql(`alter table "minorista_transactions" drop constraint "minorista_transactions_minorista_id_foreign";`);

    this.addSql(`alter table "giros" drop constraint "giros_minorista_id_foreign";`);
    this.addSql(`alter table "giros" drop constraint "giros_transferencista_id_foreign";`);
    this.addSql(`alter table "giros" drop constraint "giros_bank_account_used_id_foreign";`);

    this.addSql(`alter table "bank_account_transactions" drop constraint "bank_account_transactions_bank_account_id_foreign";`);

    this.addSql(`alter table "user_tokens" drop constraint "user_tokens_user_id_foreign";`);

    this.addSql(`alter table "transferencistas" add constraint "transferencistas_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade;`);

    this.addSql(`alter table "bank_assignments" add constraint "bank_assignments_transferencista_id_foreign" foreign key ("transferencista_id") references "transferencistas" ("id") on update cascade;`);

    this.addSql(`alter table "bank_accounts" add constraint "bank_accounts_transferencista_id_foreign" foreign key ("transferencista_id") references "transferencistas" ("id") on update cascade;`);

    this.addSql(`alter table "minoristas" add constraint "minoristas_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade;`);

    this.addSql(`alter table "minorista_transactions" add constraint "minorista_transactions_minorista_id_foreign" foreign key ("minorista_id") references "minoristas" ("id") on update cascade;`);

    this.addSql(`alter table "giros" add constraint "giros_minorista_id_foreign" foreign key ("minorista_id") references "minoristas" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "giros" add constraint "giros_transferencista_id_foreign" foreign key ("transferencista_id") references "transferencistas" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "giros" add constraint "giros_bank_account_used_id_foreign" foreign key ("bank_account_used_id") references "bank_accounts" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "bank_account_transactions" add constraint "bank_account_transactions_bank_account_id_foreign" foreign key ("bank_account_id") references "bank_accounts" ("id") on update cascade;`);

    this.addSql(`alter table "user_tokens" add constraint "user_tokens_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade;`);
  }

}
