import { Migration } from '@mikro-orm/migrations';

export class Migration20251113192259_AddReturnReasonToGiro extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "giros" drop constraint if exists "giros_status_check";`);

    this.addSql(`alter table "giros" add column "return_reason" varchar(255) null;`);
    this.addSql(`alter table "giros" add constraint "giros_status_check" check("status" in ('PENDIENTE', 'ASIGNADO', 'PROCESANDO', 'COMPLETADO', 'CANCELADO', 'DEVUELTO'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "giros" drop constraint if exists "giros_status_check";`);

    this.addSql(`alter table "giros" drop column "return_reason";`);

    this.addSql(`alter table "giros" add constraint "giros_status_check" check("status" in ('PENDIENTE', 'ASIGNADO', 'PROCESANDO', 'COMPLETADO', 'CANCELADO'));`);
  }

}
