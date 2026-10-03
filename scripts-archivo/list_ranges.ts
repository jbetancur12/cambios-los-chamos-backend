import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config();

const FACTUS_API_URL = process.env.FACTUS_API_URL || 'https://api-sandbox.factus.com.co';
const FACTUS_CLIENT_ID = process.env.FACTUS_CLIENT_ID;
const FACTUS_CLIENT_SECRET = process.env.FACTUS_CLIENT_SECRET;
const FACTUS_USERNAME = process.env.FACTUS_USERNAME;
const FACTUS_PASSWORD = process.env.FACTUS_PASSWORD;

async function getAccessToken() {
  const params = new URLSearchParams();
  params.append('grant_type', 'password');
  params.append('client_id', FACTUS_CLIENT_ID?.trim() || '');
  params.append('client_secret', FACTUS_CLIENT_SECRET?.trim() || '');
  params.append('username', FACTUS_USERNAME?.trim() || '');
  params.append('password', FACTUS_PASSWORD?.trim() || '');

  console.log('Fetching token from:', `${FACTUS_API_URL}/oauth/token`);
  
  const response = await fetch(`${FACTUS_API_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: params
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Auth error:', err);
    throw new Error('Failed to get token');
  }

  const data = await response.json() as any;
  return data.access_token;
}

async function getNumberingRanges() {
  try {
    const token = await getAccessToken();
    console.log('Got token, fetching numbering ranges...');
    
    const response = await fetch(`${FACTUS_API_URL}/v1/numbering-ranges?filter[id]&filter[document]&filter[resolution_number]&filter[technical_key]&filter[is_active]`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Ranges error:', err);
      return;
    }

    const data = await response.json() as any;
    fs.writeFileSync('ranges_output.json', JSON.stringify(data, null, 2));
    console.log('\n--- DATA SAVED TO ranges_output.json ---\n');
    
    if (data.data && Array.isArray(data.data)) {
        console.log("Found the following Range IDs:");
        data.data.forEach((range: any) => {
            console.log(`- ID: ${range.id} | Prefix: ${range.prefix} | Resolution: ${range.resolution_number} | Document: ${range.document}`);
        });
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

getNumberingRanges();
