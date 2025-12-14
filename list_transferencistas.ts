
import { MikroORM } from '@mikro-orm/core'
import { User, UserRole } from './src/entities/User'
import config from './src/mikro-orm.config'

async function listTransferencistas() {
    const orm = await MikroORM.init(config)
    const em = orm.em.fork()

    try {
        const users = await em.find(User, { role: UserRole.TRANSFERENCISTA })
        console.log('--- TRANSFERENCISTAS ---')
        users.forEach(u => {
            console.log(`- ${u.fullName} (${u.email})`)
        })
    } catch (error) {
        console.error('Error:', error)
    } finally {
        await orm.close()
    }
}

listTransferencistas()
