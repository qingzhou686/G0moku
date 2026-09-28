/*
 * 把 index.html / styles.css / game.js / app.js 打包成一个自包含的 HTML 文件。
 * 用法：node build-single.js
 * 产物：五子棋.html —— 不依赖任何外部文件，双击即可打开，方便发邮件、传网盘、上传到任意托管。
 */
var fs = require('fs');
var path = require('path');

var dir = __dirname;
function read(file) {
  return fs.readFileSync(path.join(dir, file), 'utf8');
}

var html = read('index.html');
var css = read('styles.css');
var game = read('game.js');
var app = read('app.js');

// 内联的脚本里不能出现 </script>
[['game.js', game], ['app.js', app]].forEach(function (pair) {
  if (pair[1].indexOf('</script') !== -1) {
    throw new Error(pair[0] + ' 包含 </script>，无法安全内联');
  }
});

function replaceOnce(source, needle, replacement, label) {
  if (source.indexOf(needle) === -1) throw new Error('未找到待替换内容：' + label);
  return source.replace(needle, function () { return replacement; });
}

html = replaceOnce(html, '<link rel="stylesheet" href="styles.css" />',
  '<style>\n' + css + '\n</style>', 'styles.css');
html = replaceOnce(html, '<script src="game.js"></script>',
  '<script>\n' + game + '\n</script>', 'game.js');
html = replaceOnce(html, '<script src="app.js"></script>',
  '<script>\n' + app + '\n</script>', 'app.js');

var outName = '五子棋.html';
fs.writeFileSync(path.join(dir, outName), html, 'utf8');
console.log('已生成 ' + outName + '（' + (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1) + ' KB，无外部依赖）');
