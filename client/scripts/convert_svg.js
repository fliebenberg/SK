const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function convert() {
  const svgPath = path.join(__dirname, '../public/images/logo.svg');
  const pngPath = path.join(__dirname, '../public/images/logo.png');

  console.log(`Converting ${svgPath} to ${pngPath}...`);

  if (!fs.existsSync(svgPath)) {
    console.error('Error: logo.svg not found!');
    process.exit(1);
  }

  try {
    await sharp(svgPath)
      .resize(1024, 1024)
      .png()
      .toFile(pngPath);
    console.log('Success! PNG generated successfully at:', pngPath);
  } catch (err) {
    console.error('Error rendering SVG to PNG:', err);
    process.exit(1);
  }
}

convert();
