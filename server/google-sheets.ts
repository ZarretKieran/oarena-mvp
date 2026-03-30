const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const DEFAULT_SPREADSHEET_ID = '1c5rRsicPo4VLYykHe9loW-Lpx1mPXMkFjoMlyxFD7D8';
const DEFAULT_RANGE = 'Sheet1!A:E';

type WaitlistSheetRow = {
  name: string;
  email: string;
  source: string | null;
  createdAt: number;
};

type GoogleSheetsConfig = {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
  range: string;
};

let tokenCache:
  | {
      accessToken: string;
      expiresAt: number;
    }
  | null = null;

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function getGoogleSheetsConfig(): GoogleSheetsConfig | null {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();

  if (!clientEmail || !privateKey) {
    return null;
  }

  return {
    clientEmail,
    privateKey,
    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || DEFAULT_SPREADSHEET_ID,
    range: process.env.GOOGLE_SHEETS_RANGE?.trim() || DEFAULT_RANGE,
  };
}

async function createSignedJwt(config: GoogleSheetsConfig): Promise<string> {
  const encoder = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);

  const header = base64UrlEncode(
    encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
  );
  const payload = base64UrlEncode(
    encoder.encode(
      JSON.stringify({
        iss: config.clientEmail,
        scope: GOOGLE_SHEETS_SCOPE,
        aud: GOOGLE_OAUTH_TOKEN_URL,
        exp: now + 3600,
        iat: now,
      }),
    ),
  );

  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    encoder.encode(config.privateKey),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function getGoogleAccessToken(config: GoogleSheetsConfig): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  const assertion = await createSignedJwt(config);
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenCache = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };

  return payload.access_token;
}

export async function appendWaitlistSignupToGoogleSheet(row: WaitlistSheetRow): Promise<void> {
  const config = getGoogleSheetsConfig();
  if (!config) return;

  const accessToken = await getGoogleAccessToken(config);
  const range = encodeURIComponent(config.range);

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [
          [
            new Date(row.createdAt).toISOString(),
            row.name,
            row.email,
            row.source ?? '',
            row.createdAt,
          ],
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Google Sheets append failed with ${response.status}`);
  }
}
