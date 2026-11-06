const path = require('path');
require('esbuild').buildSync({
  entryPoints: [path.join(__dirname, '../vision/vision-follow.js')],
  bundle: true,
  outfile: path.join(__dirname, '../src/main/assets/www/vision-follow.js'),
  target: 'chrome90',
  minify: true,
});
