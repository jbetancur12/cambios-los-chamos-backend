import { Migration } from '@mikro-orm/migrations';

export class Migration20251109011306 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`drop table if exists "email_verification_code" cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`create table "email_verification_code" ("id" bigserial primary key, "code" varchar(6) not null, "created_at" timestamptz not null, "expires_at" timestamptz not null, "attempts" int not null default 0, "user_id" varchar(255) not null);`);
    this.addSql(`create index "email_verification_code_code_idx" on "email_verification_code" ("code");`);
    this.addSql(`alter table "email_verification_code" add constraint "email_verification_code_user_id_key" unique ("user_id") deferrable initially deferred;`);

    this.addSql(`alter table "email_verification_code" add constraint "email_verification_code_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade deferrable initially deferred ;`);
  }

}
