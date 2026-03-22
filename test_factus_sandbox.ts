
const FACTUS_API_URL = 'https://api-sandbox.factus.com.co';
const FACTUS_CLIENT_ID = 'a152b9a4-f563-450f-bb27-0c65c922f24a'; // Sandbox client ID, NO SPACE
const FACTUS_CLIENT_SECRET = '02RjEWF56KWO3qFAcbWTQMpQY0V6DDRszvZbTXcy';
const FACTUS_USERNAME = 'raymonda998.fm@gmail.com';
const FACTUS_PASSWORD = '1088043115';

async function testFactus() {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: FACTUS_CLIENT_ID,
    client_secret: FACTUS_CLIENT_SECRET,
    username: FACTUS_USERNAME,
    password: FACTUS_PASSWORD,
  });

  try {
    const response = await fetch(`${FACTUS_API_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: body.toString()
    });
    
    console.log("STATUS CODE:", response.status);
    const text = await response.text();
    console.log("RESPONSE BODY:", text);
    
  } catch(e) {
    console.error("NETWORK ERROR:", e);
  }
}

testFactus();
