const sharp = require('sharp');

console.log('Sharp version:', sharp.versions);
console.log('\nFormat support:');

sharp.format.heif && console.log('✅ HEIF input supported');
sharp.format.heif && sharp.format.heif.output && console.log('✅ HEIF output supported');

if (!sharp.format.heif) {
    console.log('❌ HEIF not supported');
    console.log('\nTry reinstalling sharp with:');
    console.log('npm uninstall sharp');
    console.log('npm install sharp --force');
}