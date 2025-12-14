
import { MikroORM } from '@mikro-orm/core'
import { User } from './src/entities/User'
import config from './src/mikro-orm.config'

async function inspectUser() {
    const searchTerm = process.argv[2]

    if (!searchTerm) {
        console.error('Usage: npx ts-node inspect_user.ts "Search Pattern"')
        process.exit(1)
    }

    const orm = await MikroORM.init(config)
    const em = orm.em.fork()

    try {
        console.log(`Searching for user with property like "${searchTerm}"...`)
        const users = await em.find(User, {
            $or: [
                { fullName: { $like: `%${searchTerm}%` } },
                { email: { $like: `%${searchTerm}%` } }
            ]
        })

        if (users.length === 0) {
            console.error('No users found.')
            return
        }

        console.log(`Found ${users.length} user(s):`)
        users.forEach(u => {
            console.log('--------------------------------------------------')
            console.log(`ID: ${u.id}`)
            console.log(`Name: ${u.fullName}`)
            console.log(`Email: '${u.email}'`) // Single quotes to see trailing spaces
            console.log(`Role: ${u.role}`)
            console.log(`Password Hash: ${u.password ? u.password.substring(0, 20) + '...' : 'NONE'}`)
        })

    } catch (error) {
        console.error('Error inspecting user:', error)
    } finally {
        await orm.close()
    }
}

inspectUser()
