const API_URL = 'http://127.0.0.1:3000'
const EMAIL = 'jabetancur12@gmail.com'
const PASSWORD = '12345678'
const MINORISTA_ID = '5ad3daca-8d55-46ac-bc6b-3dfc147d0e5e'

async function run() {
  try {
    // 1. Login
    console.log('Logging in...')
    const loginResponse = await fetch(`${API_URL}/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })

    if (!loginResponse.ok) {
      console.error('Login failed:', await loginResponse.text())
      return
    }

    const cookie = loginResponse.headers.get('set-cookie')
    if (!cookie) {
      console.error('No cookie received')
      return
    }
    console.log('Logged in successfully.')

    // 2. Get Transactions
    console.log(`Fetching transactions for minorista ${MINORISTA_ID}...`)
    const response = await fetch(`${API_URL}/minorista/${MINORISTA_ID}/transactions`, {
      headers: {
        Cookie: cookie,
      },
    })

    console.log('Response Status:', response.status)
    const data = await response.json()
    console.log('Response Data:', JSON.stringify(data, null, 2))
  } catch (error: any) {
    console.error('Error:', error.message)
  }
}

run()
