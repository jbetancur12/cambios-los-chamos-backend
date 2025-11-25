import { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { User, UserRole } from '@/entities/User'
import { Transferencista } from '@/entities/Transferencista'
import { makePassword } from '@/lib/passwordUtils'

// Datos de los transferencistas reales
const realTransferencistasData = [
  { fullName: 'Aurora Isabel Zambrano', email: 'auroraisabelzambrano@gmail.com' },
  { fullName: 'Rossana Monticelli', email: 'kilross17@gmail.com' },
];

export class RealTransferencistasSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const defaultPassword = makePassword('12345678');
    
    console.log('Iniciando RealTransferencistasSeeder...');

    for (const data of realTransferencistasData) {
      // 1. Verificar si el usuario ya existe
      const existingUser = await em.findOne(User, { email: data.email });

      if (!existingUser) {
        // 2. Crear la entidad User
        const user = em.create(User, {
          fullName: data.fullName,
          email: data.email,
          password: defaultPassword,
          role: UserRole.TRANSFERENCISTA,
          isActive: true,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        em.persist(user);

        // 3. Crear la entidad Transferencista asociada
        const transferencista = em.create(Transferencista, {
          user,
          available: true, // Asumimos que están disponibles por defecto
          bankAccounts: [], // Sin cuentas bancarias iniciales
          giros: [],
        });
        em.persist(transferencista);
        console.log(`Transferencista creado: ${data.fullName} (${data.email})`);
      } else {
        console.log(`Usuario ya existe, omitiendo: ${data.email}`);
      }
    }

    // Guardar todos los cambios
    await em.flush();
    console.log('RealTransferencistasSeeder finalizado.');
  }
}