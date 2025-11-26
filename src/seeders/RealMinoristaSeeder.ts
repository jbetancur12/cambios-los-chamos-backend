import { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { User, UserRole } from '@/entities/User'
import { Minorista } from '@/entities/Minorista'
import { makePassword } from '@/lib/passwordUtils'

// Definimos los datos de los minoristas reales
const realMinoristasData = [
  { fullName: 'José Gregorio Vela', email: 'mayerlinrocam@gmail.com' },
  { fullName: 'Odalis', email: 'odalisg024@gmail.com' },
  { fullName: 'Alejandra Campos', email: 'andreinacampos0510@gmail' },
  { fullName: 'Rossy Erazo', email: 'rosyerazo.51@gmail.com' },
  { fullName: 'Stefanny Toledo', email: 'toledostefanny65@gmail.com' },
  { fullName: 'Jhon Freddy', email: 'fredyrobotina@hotmail.com' },
  { fullName: 'Yamilet Dehoy', email: 'yamilethdehoy@gmail.com' },
  { fullName: 'Daniela Vázquez', email: 'vasquezdaniela1902@gmail.com' },
  { fullName: 'Orliggina Urbina', email: 'orligginau@gmail.com' },
  { fullName: 'Ever Delgado', email: 'everdelgado@edbejev.com' },
  { fullName: 'Angela Zambrano', email: 'zambbrano10@gmail.com' },
  { fullName: 'Tecno Center Capilla', email: 'tecno7center@gmail.com' },
  { fullName: 'Yenny Dehoy', email: 'yennydehoy27@gmail.com' },
  { fullName: 'Yasmin Sánchez', email: 'minsa_delfin@hotmail.com' },
  { fullName: 'Jorlis Teran', email: 'neilinth18@gmail.com' },
  { fullName: 'Gabriel Montilla', email: 'mgabi7923@gmail.com' },
  { fullName: 'Nathaly Peña', email: 'nathalypea@gmail.com' },
  { fullName: 'Juan', email: 'elijhuan.1229@gmail.com' },
  { fullName: 'Eulices Lopez', email: 'shagyyulizerel@gmail.com' },
  { fullName: 'Freddy Pinto', email: 'cafeinternetfreddy@gmail.com' },
  { fullName: 'Javielys López', email: 'javielyslopez6@gmail.com' },
  { fullName: 'Niurka Flores', email: 'sanchezadiuska30@gmail.com' },
  { fullName: 'Petra Martínez', email: 'petradevega20@gmail.com' },
  { fullName: 'Wiliam Fortinch', email: 'williamjavierola@gmail.com' },
  { fullName: 'Jenny Lozano', email: 'internetjenny0728@gmail.com' },
  { fullName: 'Jesús Segura', email: 'jesusnsegurap@gmail.com' },
  { fullName: 'Barbara Pérez', email: 'nanip2304@gmail.com' },
  { fullName: 'Johalis Pérez', email: 'carmennperez.9000@gmail.com' },
  { fullName: 'Christian Campiño', email: 'mayraalejandracampinosalazar@gmail.com' },
]

export class RealMinoristasSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const defaultPassword = makePassword('12345678')
    const creditLimit = 0 // Mismo límite de crédito usado en el seeder de prueba

    console.log('Iniciando RealMinoristasSeeder...')

    for (const data of realMinoristasData) {
      // 1. Verificar si el usuario ya existe
      const existingUser = await em.findOne(User, { email: data.email })

      if (!existingUser) {
        // 2. Crear la entidad User
        const user = em.create(User, {
          fullName: data.fullName,
          email: data.email,
          password: defaultPassword,
          role: UserRole.MINORISTA,
          isActive: true,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        em.persist(user)

        // 3. Crear la entidad Minorista
        const minorista = em.create(Minorista, {
          user,
          creditLimit,
          availableCredit: creditLimit,
          creditBalance: 0,
          transactions: [],
          giros: [],
        })
        em.persist(minorista)
        console.log(`Minorista creado: ${data.fullName} (${data.email})`)
      } else {
        console.log(`Usuario ya existe, omitiendo: ${data.email}`)
      }
    }

    // Usar flush() para guardar todos los cambios en la base de datos
    await em.flush()
    console.log('RealMinoristasSeeder finalizado.')
  }
}
