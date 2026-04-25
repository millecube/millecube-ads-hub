/**
 * One-time script to get a Google Drive OAuth2 refresh token.
 * Run once locally: node backend/scripts/get-drive-token.js
 * Then add the printed values to Render environment variables.
 */

const { google } = require('googleapis');
const http = require('http');
const { URL } = require('url');

// Paste your OAuth2 credentials here before running
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || 'PASTE_YOUR_CLIENT_ID_HERE';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'PASTE_YOUR_CLIENT_SECRET_HERE';
const REDIRECT_URI  = 'http://localhost:3999/callback';

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/drive'],
  prompt: 'consent'   // force refresh_token to be returned
});

console.log('\n=== Millecube Drive Token Setup ===\n');
console.log('1. Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n2. Sign in with the Google account that OWNS your Drive folder.');
console.log('3. Click Allow — then come back here.\n');

const server = http.createServer(async (req, res) => {
  try {
    const code = new URL(req.url, 'http://localhost:3999').searchParams.get('code');
    if (!code) { res.end('No code found.'); return; }

    const { tokens } = await oauth2.getToken(code);
    res.end('<h2>Success! Check your terminal for the token.</h2>');
    server.close();

    const output = [
      '\n=== ADD THESE TO RENDER ENVIRONMENT VARIABLES ===\n',
      `GOOGLE_CLIENT_ID     = ${CLIENT_ID}`,
      `GOOGLE_CLIENT_SECRET = ${CLIENT_SECRET}`,
      `GOOGLE_REFRESH_TOKEN = ${tokens.refresh_token}`,
      '\n=================================================\n'
    ].join('\n');
    console.log(output);
    require('fs').writeFileSync(
      require('path').join(__dirname, 'token-output.txt'),
      output
    );
  } catch (err) {
    res.end('Error: ' + err.message);
    console.error(err);
  }
});

server.listen(3999, () => {
  console.log('Waiting for Google to redirect back... (server on port 3999)\n');
});
