import { Migration } from '@mikro-orm/migrations'

export class Migration20260814000001_DropCreditFrequencyCheck extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "credits" drop constraint if exists "credits_frequency_check";`)
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "credits" add constraint "credits_frequency_check" check("frequency" in ('daily', 'weekly', 'biweekly', 'monthly'));`
    )
  }
}
