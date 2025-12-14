
import { MikroORM } from '@mikro-orm/core'
import { User } from './src/entities/User'
import config from './src/mikro-orm.config'
import { makePassword } from './src/lib/passwordUtils'

async function resetPassword() {
    const searchTerm = process.argv[2]
    const newPassword = process.argv[3] || '12345678'

    if (!searchTerm) {
        console.error('Usage: npx ts-node reset_password_manual.ts "User Name Pattern" [NewPassword]')
        process.exit(1)
    }

    const orm = await MikroORM.init(config)
    const em = orm.em.fork()

    try {
        console.log(`Searching for user with name like "${searchTerm}"...`)
        const users = await em.find(User, { fullName: { $like: `%${searchTerm}%` } })

        if (users.length === 0) {
            console.error('No users found.')
            return
        }

        if (users.length > 1) {
            console.warn('Multiple users found. Please be more specific or confirm the list below:')
            users.forEach(u => console.log(` - ${u.id}: ${u.fullName} (${u.email})`))

            // If we want to force reset all, we could, but better to be safe.
            // For now, let's just error if > 1 unless a force flag is present, or just list them.
            console.error('Aborting to prevent accidental bulk reset. Please specify a unique name.')
            return
        }

        const user = users[0]
        console.log(`Found user: ${user.fullName} (${user.email})`)

        const hashedPassword = makePassword(newPassword)
        user.password = hashedPassword

        await em.persistAndFlush(user)
        console.log(`Password for ${user.fullName} reset to "${newPassword}" successfully.`)

    } catch (error) {
        console.error('Error resetting password:', error)
    } finally {
        await orm.close()
    }
}

resetPassword()
