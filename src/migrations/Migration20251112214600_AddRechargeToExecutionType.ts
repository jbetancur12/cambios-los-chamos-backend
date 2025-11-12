import { Migration } from '@mikro-orm/migrations';

export class Migration20251112214600_AddRechargeToExecutionType extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "giros" drop constraint if exists "giros_execution_type_check";`);

    this.addSql(`alter table "giros" add constraint "giros_execution_type_check" check("execution_type" in ('TRANSFERENCIA', 'PAGO_MOVIL', 'EFECTIVO', 'ZELLE', 'OTROS', 'RECARGA'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "giros" drop constraint if exists "giros_execution_type_check";`);

    this.addSql(`alter table "giros" add constraint "giros_execution_type_check" check("execution_type" in ('TRANSFERENCIA', 'PAGO_MOVIL', 'EFECTIVO', 'ZELLE', 'OTROS'));`);
  }

}
