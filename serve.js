/*
 * 极简静态服务器：让同一网络下的其他人也能访问这个网页。
 * 用法：node serve.js [端口]（默认 8080）
 */
var http = require('http');
var fs = require('fs');
var path = require('path');
var os = require('os');

var root = __dirname;
var port = Number(process.argv[2]) || 8080;

var TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8'
};

var DEFAULT_FILE = 'index.html';

var server = http.createServer(function (req, res) {
  var urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/' || urlPath === '') urlPath = '/' + DEFAULT_FILE;

  var target = path.resolve(root, urlPath.replace(/^[/\\]+/, ''));
  if (target !== root && target.indexOf(root + path.sep) !== 0) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 越权访问');
  }

  fs.readFile(target, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 未找到 ' + urlPath);
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

server.on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    console.error('端口 ' + port + ' 已被占用，换一个端口再试：node serve.js 8081');
  } else {
    console.error('启动失败：' + err.message);
  }
  process.exit(1);
});

server.listen(port, '0.0.0.0', function () {
  var ips = [];
  Object.keys(os.networkInterfaces()).forEach(function (name) {
    (os.networkInterfaces()[name] || []).forEach(function (info) {
      if (info && info.family === 'IPv4' && !info.internal) ips.push(info.address);
    });
  });

  console.log('');
  console.log('  五子棋服务器已启动（按 Ctrl+C 停止）');
  console.log('  ------------------------------------------');
  console.log('  本机访问：            http://localhost:' + port + '/');
  ips.forEach(function (ip) {
    console.log('  同一网络的其他设备：  http://' + ip + ':' + port + '/');
  });
  console.log('  ------------------------------------------');
  console.log('  把上面「同一网络」的地址发给别人，他们就能打开这个网页。');
  console.log('');
});
