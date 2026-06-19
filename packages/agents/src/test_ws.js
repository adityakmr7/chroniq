const https = require('node:https');
const crypto = require('node:crypto');
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WIN_EPOCH = 11644473600;
let ticks = Math.floor(Date.now() / 1000);
ticks += WIN_EPOCH;
ticks -= ticks % 300;
ticks *= 10000000;
const strToHash = ticks.toFixed(0) + TRUSTED_CLIENT_TOKEN;
const secMsGec = crypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase();
const connectionId = crypto.randomUUID().replaceAll('-', '');
const key = crypto.randomBytes(16).toString('base64');

const req = https.request({
  hostname: 'speech.platform.bing.com',
  path: '/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=' + TRUSTED_CLIENT_TOKEN + '&Sec-MS-GEC=' + secMsGec + '&Sec-MS-GEC-Version=1-143.0.3650.75&ConnectionId=' + connectionId,
  method: 'GET',
  headers: {
    'Connection': 'Upgrade',
    'Upgrade': 'websocket',
    'Sec-WebSocket-Key': key,
    'Sec-WebSocket-Version': '13',
    'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0'
  }
});
req.on('upgrade', (res, socket, head) => {
  console.log('UPGRADE SUCCESS IN CONTAINER!!! Status:', res.statusCode);
  socket.destroy();
});
req.on('error', (e) => {
  console.log('ERROR:', e.message);
});
req.on('response', (res) => {
  console.log('HTTP RESPONSE STATUS:', res.statusCode);
});
req.end();
