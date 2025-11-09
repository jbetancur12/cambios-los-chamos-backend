import { Migration } from '@mikro-orm/migrations';

export class Migration20251109012151 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "user_tokens" ("id" varchar(255) not null, "user_id" varchar(255) not null, "token" varchar(255) not null, "type" text check ("type" in ('EMAIL_VERIFICATION', 'PASSWORD_RESET')) not null, "expires_at" timestamptz not null, "used" boolean not null default false, "created_at" timestamptz not null, constraint "user_tokens_pkey" primary key ("id"));`);
    this.addSql(`alter table "user_tokens" add constraint "user_tokens_token_unique" unique ("token");`);

    this.addSql(`alter table "user_tokens" add constraint "user_tokens_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "user_tokens" cascade;`);
  }

}
