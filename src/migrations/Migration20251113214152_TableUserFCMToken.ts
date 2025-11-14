import { Migration } from '@mikro-orm/migrations';

export class Migration20251113214152_TableUserFCMToken extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "user_fcm_tokens" ("id" serial primary key, "fcm_token" text not null, "user_id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null);`);
    this.addSql(`alter table "user_fcm_tokens" add constraint "user_fcm_tokens_fcm_token_unique" unique ("fcm_token");`);

    this.addSql(`alter table "user_fcm_tokens" add constraint "user_fcm_tokens_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);

    this.addSql(`drop table if exists "transferencista_fcm_tokens" cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`create table "transferencista_fcm_tokens" ("id" serial primary key, "fcm_token" text not null, "user_id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null);`);
    this.addSql(`alter table "transferencista_fcm_tokens" add constraint "transferencista_fcm_tokens_fcm_token_unique" unique ("fcm_token");`);

    this.addSql(`alter table "transferencista_fcm_tokens" add constraint "transferencista_fcm_tokens_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);

    this.addSql(`drop table if exists "user_fcm_tokens" cascade;`);
  }

}
