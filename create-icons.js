// Simple script to create placeholder icons for the extension
import fs from 'fs';
import path from 'path';

const sizes = [16, 48, 128];
const iconDir = 'extension/icons';

// Ensure directory exists
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

// SVG template for the icon
const createSvg = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#3B82F6" rx="${size * 0.1}"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="Arial, sans-serif" font-size="${size * 0.4}" font-weight="bold">H</text>
</svg>
`;

// Create SVG files
sizes.forEach(size => {
  const svg = createSvg(size);
  const filename = path.join(iconDir, `icon-${size}.svg`);
  fs.writeFileSync(filename, svg);
  console.log(`Created ${filename}`);
});

console.log('Icon SVGs created. You can convert them to PNG using an image editor or online tool.');