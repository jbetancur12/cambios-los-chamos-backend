// Use native fetch

// Use the production values the user states they have in their production env
const FACTUS_API_URL = 'https://api.factus.com.co';
const FACTUS_CLIENT_ID = 'a152b7db-d083-48a5-94b6-9fff442228af';
const FACTUS_CLIENT_SECRET = 'C5bHB7pK9CvByrh6MTyZmpz89MqjKn6aGrcovxn';
const FACTUS_USERNAME = 'raymonda998.fm@gmail.com';
const FACTUS_PASSWORD = '1088043115';

async function testFactusProd() {
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

testFactusProd();
