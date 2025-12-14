
import { MikroORM } from '@mikro-orm/core'
import { User } from './src/entities/User'
import config from './src/mikro-orm.config'

async function getFullHash() {
    const email = process.argv[2]
    if (!email) {
        console.error('Usage: npx ts-node get_full_hash.ts "email"')
        process.exit(1)
    }

    const orm = await MikroORM.init(config)
    const em = orm.em.fork()

    try {
        const user = await em.findOne(User, { email })
        if (!user) {
            console.error('User not found')
            return
        }
        console.log(`User: ${user.fullName}`)
        console.log(`Email: ${user.email}`)
        console.log(`FULL HASH: ${user.password}`)
    } catch (error) {
        console.error('Error:', error)
    } finally {
        await orm.close()
    }
}

getFullHash()
