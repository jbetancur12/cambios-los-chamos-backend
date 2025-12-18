import { logger } from '../lib/logger'

// ... existing consts ...
// I need to import logger at the top.
// Since verify_file in step 364 showed no imports, I'll add it.
// Wait, test_api_transactions.ts uses `fetch`. It might be a script run with node 18+ or similar.
// It doesn't seem to import DI or anything. It's an external script hitting the API.
// Using `@/lib/logger` might fail if it relies on path aliases and this is run standalone.
// However, the user asked to replace "console.log" in "backend".
// If this script is part of the backend codebase (it is in `src/scripts`), it typically runs with `ts-node -r tsconfig-paths/register`.
// So importing from `../lib/logger` should work.

const API_URL = 'http://127.0.0.1:3000'
const EMAIL = 'jabetancur12@gmail.com'
const PASSWORD = '12345678'
const MINORISTA_ID = '5ad3daca-8d55-46ac-bc6b-3dfc147d0e5e'

async function run() {
  try {
    // 1. Login
    logger.info('Logging in...')
    const loginResponse = await fetch(`${API_URL}/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })

    if (!loginResponse.ok) {
      logger.error(`Login failed: ${await loginResponse.text()}`)
      return
    }

    const cookie = loginResponse.headers.get('set-cookie')
    if (!cookie) {
      logger.error('No cookie received')
      return
    }
    logger.info('Logged in successfully.')

    // 2. Get Transactions
    logger.info(`Fetching transactions for minorista ${MINORISTA_ID}...`)
    const response = await fetch(`${API_URL}/minorista/${MINORISTA_ID}/transactions`, {
      headers: {
        Cookie: cookie,
      },
    })

    logger.info(`Response Status: ${response.status}`)
    const data = await response.json()
    logger.info({ data }, 'Response Data')
  } catch (error: any) {
    logger.error(`Error: ${error.message}`)
  }
}

run()
