import { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { User } from '@/entities/User'
import { Transferencista } from '@/entities/Transferencista'
import { BankAccount, AccountType } from '@/entities/BankAccount'
import { Bank } from '@/entities/Bank'

// Mapeo de transferencistas a sus cuentas. 
// NOTA: Los 'accountHolder' deben ser el nombre legal del titular.
// 'accountNumber' y 'balance' son placeholders, DEBES reemplazarlos con datos reales si los tienes.
const realBankAccountsData = [
  {
    transferencistaEmail: 'auroraisabelzambrano@gmail.com',
    fullName: 'Aurora Isabel Zambrano', // Nombre del titular de la cuenta
    banks: [
      {
        bankName: 'BANCO DE VENEZUELA',
        accountNumber: '0000-0000-0000-0000-0001', // ¡REEMPLAZAR!
        accountType: AccountType.CORRIENTE,
      },
      {
        bankName: 'BANESCO',
        accountNumber: '0000-0000-0000-0000-0002', // ¡REEMPLAZAR!
        accountType: AccountType.CORRIENTE,
      },
    ],
  },
  {
    transferencistaEmail: 'kilross17@gmail.com',
    fullName: 'Rossana Monticelli', // Nombre del titular de la cuenta
    banks: [
      {
        bankName: 'BANCO MERCANTIL',
        accountNumber: '0000-0000-0000-0000-0003', // ¡REEMPLAZAR!
        accountType: AccountType.CORRIENTE,
      },
      {
        bankName: 'BBVA PROVINCIAL',
        accountNumber: '0000-0000-0000-0000-0004', // ¡REEMPLAZAR!
        accountType: AccountType.CORRIENTE,
      },
      {
        bankName: 'BANESCO',
        accountNumber: '0000-0000-0000-0000-0005', // ¡REEMPLAZAR!
        accountType: AccountType.CORRIENTE,
      },
      {
        bankName: 'BANCO DE VENEZUELA',
        accountNumber: '0000-0000-0000-0000-0006', // ¡REEMPLAZAR!
        accountType: AccountType.CORRIENTE,
      },
    ],
  },
];

export class RealTransferencistaBankAccountsSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    console.log('Iniciando RealTransferencistaBankAccountsSeeder...');
    
    // Asumimos que la entidad Bank existe para estos nombres
    const bankNames = new Set(realBankAccountsData.flatMap(d => d.banks.map(b => b.bankName)));
    const existingBanks = await em.find(Bank, { name: { $in: Array.from(bankNames) } });
    const bankMap = new Map(existingBanks.map(b => [b.name, b]));

    for (const data of realBankAccountsData) {
      // 1. Buscar al Transferencista
      const user = await em.findOne(User, { email: data.transferencistaEmail });
      
      if (!user) {
        console.warn(`Usuario no encontrado para el email: ${data.transferencistaEmail}. Omitiendo la creación de cuentas.`);
        continue;
      }
      
      // La relación Transferencista debería estar cargada o ser buscable desde el User
      const transferencista = await em.findOne(Transferencista, { user });

      if (!transferencista) {
        console.warn(`Entidad Transferencista no encontrada para el usuario: ${data.transferencistaEmail}. Omitiendo la creación de cuentas.`);
        continue;
      }

      // 2. Crear las cuentas bancarias
      for (const bankData of data.banks) {
        const bank = bankMap.get(bankData.bankName);

        if (!bank) {
          console.error(`ERROR: El banco con nombre "${bankData.bankName}" NO existe en la base de datos. Omitiendo la cuenta.`);
          continue;
        }

        // Se crea la cuenta bancaria
        const bankAccount = em.create(BankAccount, {
          transferencista,
          bank,
          accountNumber: bankData.accountNumber,
          accountHolder: data.fullName, // Usamos el nombre del titular del array principal
          accountType: bankData.accountType,
          balance: 0, // Balance inicial de 0
          ownerType: 'TRANSFERENCISTA' as any,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        em.persist(bankAccount);
        console.log(`Cuenta creada para ${data.fullName}: ${bankData.bankName} (${bankData.accountNumber})`);
      }
    }

    await em.flush();
    console.log('RealTransferencistaBankAccountsSeeder finalizado.');
  }
}