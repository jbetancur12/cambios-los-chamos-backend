
import { MikroORM } from '@mikro-orm/core'
import { User } from './src/entities/User'
import config from './src/mikro-orm.config'
import { checkPassword } from './src/lib/passwordUtils'

async function testPassword() {
    const email = process.argv[2]
    const passwordCandidate = process.argv[3]

    if (!email || !passwordCandidate) {
        console.error('Usage: npx ts-node test_password.ts "email@example.com" "password_to_check"')
        process.exit(1)
    }

    const orm = await MikroORM.init(config)
    const em = orm.em.fork()

    try {
        const user = await em.findOne(User, { email })

        if (!user) {
            console.error(`User not found: ${email}`)
            return
        }

        console.log(`User: ${user.fullName} (${user.email})`)
        const isMatch = checkPassword(passwordCandidate, user.password)

        if (isMatch) {
            console.log('✅ Password MATCHES the stored hash.')
            console.log('This means the credentials are correct in the DB.')
            console.log('If login still fails in the app, checking the API/Token logic is next.')
        } else {
            console.error('❌ Password does NOT match the stored hash.')
            console.log('Explanation: The password in this DB backup is different from what you typed.')
            console.log('It is likely this backup is from BEFORE the last password change in Production.')
        }

    } catch (error) {
        console.error('Error checking password:', error)
    } finally {
        await orm.close()
    }
}

testPassword()
