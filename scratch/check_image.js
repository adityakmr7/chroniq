const fs = require('fs');
const path = require('path');

const imgPath = path.join(__dirname, '../output/what-happen-after-mahabharat/scene_0.jpg');
if (!fs.existsSync(imgPath)) {
  console.error("Image file does not exist!");
  process.exit(1);
}

const buffer = fs.readFileSync(imgPath);
console.log("Image size in bytes:", buffer.length);
console.log("First 16 bytes:", buffer.subarray(0, 16).toString('hex'));

// Check magic bytes
const hex = buffer.subarray(0, 4).toString('hex');
if (hex === 'ffd8ffe0' || hex === 'ffd8ffe1' || hex === 'ffd8ffe2') {
  console.log("File type: JPEG");
} else if (hex === '89504e47') {
  console.log("File type: PNG");
} else if (buffer.subarray(0, 4).toString('utf8') === 'RIFF' && buffer.subarray(8, 12).toString('utf8') === 'WEBP') {
  console.log("File type: WEBP");
} else {
  console.log("File type: Unknown magic bytes:", hex);
}
