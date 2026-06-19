import * as tls from "node:tls";
import * as crypto from "node:crypto";

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WIN_EPOCH = 11644473600;

function getSecMsGec() {
  let ticks = Math.floor(Date.now() / 1000);
  ticks += WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= 10000000;
  const strToHash = ticks.toFixed(0) + TRUSTED_CLIENT_TOKEN;
  return crypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase();
}

function buildFrame(opcode: number, payload: Buffer): Buffer {
  const len = payload.length;
  let headerLen = 2 + 4; // opcode + len byte + 4 bytes mask
  if (len >= 126 && len <= 65535) {
    headerLen += 2;
  } else if (len > 65535) {
    headerLen += 8;
  }
  const frame = Buffer.alloc(headerLen + len);
  frame[0] = 0x80 | opcode; // FIN = 1
  
  let offset = 2;
  if (len <= 125) {
    frame[1] = 0x80 | len;
  } else if (len <= 65535) {
    frame[1] = 0x80 | 126;
    frame.writeUInt16BE(len, 2);
    offset += 2;
  } else {
    frame[1] = 0x80 | 127;
    frame.writeBigUInt64BE(BigInt(len), 2);
    offset += 8;
  }
  
  const maskKey = crypto.randomBytes(4);
  maskKey.copy(frame, offset);
  offset += 4;
  
  for (let i = 0; i < len; i++) {
    frame[offset + i] = payload[i] ^ maskKey[i % 4];
  }
  return frame;
}

class FrameParser {
  private buffer: Buffer = Buffer.alloc(0);

  add(data: Buffer) {
    this.buffer = Buffer.concat([this.buffer, data]);
  }

  next(): { opcode: number; payload: Buffer } | null {
    if (this.buffer.length < 2) return null;
    const opcode = this.buffer[0] & 0x0f;
    const mask = (this.buffer[1] & 0x80) !== 0;
    let payloadLen = this.buffer[1] & 0x7f;
    let offset = 2;

    if (payloadLen === 126) {
      if (this.buffer.length < 4) return null;
      payloadLen = this.buffer.readUInt16BE(2);
      offset += 2;
    } else if (payloadLen === 127) {
      if (this.buffer.length < 10) return null;
      payloadLen = Number(this.buffer.readBigUInt64BE(2));
      offset += 8;
    }

    const totalLen = offset + (mask ? 4 : 0) + payloadLen;
    if (this.buffer.length < totalLen) return null;

    if (mask) {
      const maskKey = this.buffer.subarray(offset, offset + 4);
      offset += 4;
      const payload = Buffer.alloc(payloadLen);
      for (let i = 0; i < payloadLen; i++) {
        payload[i] = this.buffer[offset + i] ^ maskKey[i % 4];
      }
      this.buffer = this.buffer.subarray(totalLen);
      return { opcode, payload };
    } else {
      const payload = this.buffer.subarray(offset, offset + payloadLen);
      this.buffer = this.buffer.subarray(totalLen);
      return { opcode, payload: Buffer.from(payload) };
    }
  }
}

async function test() {
  const secMsGec = getSecMsGec();
  const connectionId = crypto.randomUUID().replaceAll('-', '');
  const key = crypto.randomBytes(16).toString('base64');
  
  const path = `/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=1-143.0.3650.75&ConnectionId=${connectionId}`;
  
  console.log("Connecting...");
  const socket = tls.connect(443, 'speech.platform.bing.com', {
    servername: 'speech.platform.bing.com'
  });
  
  let handshaked = false;
  let responseBuffer = Buffer.alloc(0);
  const parser = new FrameParser();
  const audioChunks: Buffer[] = [];
  
  socket.on('secureConnect', () => {
    console.log("Connected, sending handshake...");
    const req = [
      `GET ${path} HTTP/1.1`,
      `Host: speech.platform.bing.com`,
      `Connection: Upgrade`,
      `Upgrade: websocket`,
      `Sec-WebSocket-Key: ${key}`,
      `Sec-WebSocket-Version: 13`,
      `Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold`,
      `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0`,
      ``,
      ``
    ].join('\r\n');
    socket.write(req);
  });
  
  socket.on('data', (data) => {
    if (!handshaked) {
      responseBuffer = Buffer.concat([responseBuffer, data]);
      const idx = responseBuffer.indexOf('\r\n\r\n');
      if (idx !== -1) {
        const headerText = responseBuffer.subarray(0, idx).toString();
        console.log("=== HANDSHAKE RESPONSE ===");
        console.log(headerText);
        console.log("==========================");
        
        if (!headerText.includes("101 Switching Protocols")) {
          console.error("Handshake failed!");
          socket.destroy();
          return;
        }
        
        handshaked = true;
        const remaining = responseBuffer.subarray(idx + 4);
        if (remaining.length > 0) {
          parser.add(remaining);
        }
        
        // Start synthesis configuration
        console.log("Handshake successful, sending speech config and SSML...");
        const speechConfig = JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
              }
            }
          }
        });
        const configMsg = `X-Timestamp:${new Date().toString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${speechConfig}`;
        socket.write(buildFrame(1, Buffer.from(configMsg)));
        
        const voice = "hi-IN-MadhurNeural";
        const text = "नमस्ते, यह क्रोनिक वीडियो ऑटोमेशन प्लेटफॉर्म का परीक्षण है।";
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='hi-IN'>`
          + `<voice name='${voice}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>`
          + `${text}</prosody></voice></speak>`;
        const ssmlMsg = `X-RequestId:${crypto.randomUUID().replaceAll('-', '')}\r\nContent-Type:application/ssml+xml\r\n`
          + `X-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\n\r\n${ssml}`;
        socket.write(buildFrame(1, Buffer.from(ssmlMsg)));
      }
    } else {
      parser.add(data);
      let frame;
      while ((frame = parser.next()) !== null) {
        if (frame.opcode === 1) {
          // Text message
          const text = frame.payload.toString('utf8');
          console.log("TEXT FRAME:", text.substring(0, 100) + (text.length > 100 ? "..." : ""));
          if (text.includes("turn.end")) {
            console.log("Turn ended, closing connection.");
            const closeFrame = buildFrame(8, Buffer.alloc(0));
            socket.write(closeFrame);
            socket.end();
          }
        } else if (frame.opcode === 2) {
          // Binary message
          const separator = 'Path:audio\r\n';
          const data = frame.payload;
          const idx = data.indexOf(separator);
          if (idx !== -1) {
            const content = data.subarray(idx + separator.length);
            audioChunks.push(content);
            console.log(`BINARY FRAME: Received audio chunk of size ${content.length}`);
          } else {
            console.log("BINARY FRAME: Separator not found");
          }
        } else if (frame.opcode === 8) {
          console.log("Close frame received.");
          socket.end();
        }
      }
    }
  });
  
  socket.on('close', () => {
    console.log("Connection closed.");
    const totalAudio = Buffer.concat(audioChunks);
    console.log(`Total audio synthesized: ${totalAudio.length} bytes`);
  });
  
  socket.on('error', (err) => {
    console.error("Socket error:", err);
  });
}

test().catch(console.error);
