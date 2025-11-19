import { Migration } from '@mikro-orm/migrations';

export class Migration20251119024025_AddExecutionTypeToBeneficiarySuggestion extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "beneficiary_suggestion" add column "execution_type" text check ("execution_type" in ('TRANSFERENCIA', 'PAGO_MOVIL', 'EFECTIVO', 'ZELLE', 'OTROS', 'RECARGA')) default 'TRANSFERENCIA';`);
    this.addSql(`alter table "beneficiary_suggestion" alter column "execution_type" drop default;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "beneficiary_suggestion" drop column "execution_type";`);
  }

}
