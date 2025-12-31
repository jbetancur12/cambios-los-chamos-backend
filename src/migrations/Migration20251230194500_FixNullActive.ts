import { Migration } from '@mikro-orm/migrations';

export class Migration20251230194500_FixNullActive extends Migration {

    override async up(): Promise<void> {
        // Update users with NULL isActive to TRUE
        this.addSql(`UPDATE "users" SET "is_active" = true WHERE "is_active" IS NULL;`);
    }

    override async down(): Promise<void> {
        // Cannot reliably revert NULLs since we don't know which were originally NULL or TRUE.
        // Leaving empty as this is a one-way data fix.
    }

}
