import { Migration } from '@mikro-orm/migrations';

export class Migration20251118154931_CreateBeneficiarySuggestionTable extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "beneficiary_suggestion" ("id" uuid not null, "user_id" varchar(255) not null, "beneficiary_name" varchar(255) not null, "beneficiary_id" varchar(255) not null, "phone" varchar(255) not null, "bank_id" varchar(255) not null, "account_number" varchar(255) not null, "created_at" date not null, "updated_at" date not null, constraint "beneficiary_suggestion_pkey" primary key ("id"));`);
    this.addSql(`create index "beneficiary_suggestion_user_id_created_at_index" on "beneficiary_suggestion" using BTREE ("user_id", "created_at");`);

    this.addSql(`alter table "beneficiary_suggestion" add constraint "beneficiary_suggestion_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "beneficiary_suggestion" cascade;`);
  }

}
