import { Migration } from '@mikro-orm/migrations'

export class Migration20260814000002_CreateCreditFollowUps extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "credit_follow_ups" ("id" varchar(255) not null, "credit_id" varchar(255) not null, "note" text not null, "created_by_id" varchar(255) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "credit_follow_ups_pkey" primary key ("id"));`
    )
    this.addSql(
      `alter table "credit_follow_ups" add constraint "credit_follow_ups_credit_id_foreign" foreign key ("credit_id") references "credits" ("id") on delete cascade on update cascade;`
    )
    this.addSql(
      `alter table "credit_follow_ups" add constraint "credit_follow_ups_created_by_id_foreign" foreign key ("created_by_id") references "users" ("id") on delete set null on update cascade;`
    )
    this.addSql(`create index "credit_follow_ups_created_at_index" on "credit_follow_ups" ("created_at");`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "credit_follow_ups" cascade;`)
  }
}
