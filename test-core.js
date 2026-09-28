/* 核心逻辑自测：node test-core.js */
var assert = require('assert');
var Core = require('./game.js');

var B = Core.BLACK;
var W = Core.WHITE;
var E = Core.EMPTY;
var passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (err) {
    console.error('  FAIL ' + name + '\n       ' + err.message);
    process.exitCode = 1;
  }
}

function put(bd, list, player) {
  list.forEach(function (p) { Core.set(bd, p[0], p[1], player); });
}

console.log('\n五子棋核心逻辑测试\n');

test('横向五连可判定胜负', function () {
  var bd = Core.createBoard();
  put(bd, [[7, 3], [7, 4], [7, 5], [7, 6], [7, 7]], B);
  var win = Core.findWin(bd, 7, 7);
  assert.ok(win, '应判定为获胜');
  assert.strictEqual(win.length, 5);
});

test('纵向五连可判定胜负', function () {
  var bd = Core.createBoard();
  put(bd, [[2, 9], [3, 9], [4, 9], [5, 9], [6, 9]], W);
  assert.ok(Core.findWin(bd, 4, 9), '应判定为获胜');
});

test('两个方向的斜向五连均可判定', function () {
  var a = Core.createBoard();
  put(a, [[3, 3], [4, 4], [5, 5], [6, 6], [7, 7]], B);
  assert.ok(Core.findWin(a, 5, 5), '右下斜向应获胜');

  var b = Core.createBoard();
  put(b, [[3, 11], [4, 10], [5, 9], [6, 8], [7, 7]], W);
  assert.ok(Core.findWin(b, 5, 9), '左下斜向应获胜');
});

test('四连不算获胜，被堵住的四连也不算', function () {
  var bd = Core.createBoard();
  put(bd, [[7, 3], [7, 4], [7, 5], [7, 6]], B);
  assert.strictEqual(Core.findWin(bd, 7, 6), null);

  var blocked = Core.createBoard();
  put(blocked, [[7, 2]], W);
  put(blocked, [[7, 3], [7, 4], [7, 5], [7, 6]], B);
  assert.strictEqual(Core.findWin(blocked, 7, 6), null, '两端被封堵不应算五连');
});

test('AI 抓住直接取胜的机会', function () {
  var bd = Core.createBoard();
  put(bd, [[5, 5], [5, 6], [5, 7], [5, 8]], B);
  put(bd, [[6, 6], [6, 7], [6, 8]], W);

  ['easy', 'normal', 'hard'].forEach(function (level) {
    var mv = Core.chooseMove(bd, B, level);
    Core.set(bd, mv.r, mv.c, B);
    assert.ok(Core.findWin(bd, mv.r, mv.c), level + ' 难度应立即取胜，实际落子 ' + Core.toNotation(mv.r, mv.c));
    Core.set(bd, mv.r, mv.c, E);
  });
});

test('AI 封堵对手的必胜点', function () {
  var bd = Core.createBoard();
  put(bd, [[7, 2]], B);                       // 封死左端，白棋只剩 (7,7) 一个成五点
  put(bd, [[7, 3], [7, 4], [7, 5], [7, 6]], W);
  put(bd, [[8, 5]], B);

  ['normal', 'hard'].forEach(function (level) {
    var mv = Core.chooseMove(bd, B, level);
    assert.deepStrictEqual([mv.r, mv.c], [7, 7], level + ' 难度应封堵 (7,7)');
  });
});

test('AI 会应对活三威胁', function () {
  var bd = Core.createBoard();
  put(bd, [[7, 5], [7, 6], [7, 7]], W);   // 白棋活三
  put(bd, [[9, 9]], B);

  var mv = Core.chooseMove(bd, B, 'hard');
  assert.ok([4, 8].indexOf(mv.c) !== -1 && mv.r === 7,
    '应堵在活三两端之一，实际 ' + Core.toNotation(mv.r, mv.c));
});

test('候选点都落在空位上', function () {
  var bd = Core.createBoard();
  put(bd, [[7, 7], [7, 8], [8, 8]], B);
  put(bd, [[6, 7], [8, 7]], W);
  var cands = Core.candidateMoves(bd);
  assert.ok(cands.length > 0, '应存在候选点');
  cands.forEach(function (p) {
    assert.strictEqual(Core.get(bd, p[0], p[1]), E, '候选点必须是空位');
  });
  assert.ok(!cands.some(function (p) { return p[0] === 7 && p[1] === 7; }), '已落子处不应出现在候选中');
});

// 独立实现的暴力扫描，用来交叉验证 findWin 不会漏判
function bruteWinner(bd) {
  var n = bd.size;
  var dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  function g(r, c) {
    return (r >= 0 && c >= 0 && r < n && c < n) ? bd.cells[r * n + c] : -1;
  }
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      var p = g(r, c);
      if (p <= 0) continue;
      for (var d = 0; d < dirs.length; d++) {
        var k = 1;
        while (g(r + dirs[d][0] * k, c + dirs[d][1] * k) === p) k++;
        if (k >= 5) return p;
      }
    }
  }
  return 0;
}

// 随机开局，避免自我对弈只跑出单一棋路
function randomOpening(bd, plies) {
  var center = Math.floor(bd.size / 2);
  var p = B;
  for (var i = 0; i < plies; i++) {
    for (;;) {
      var r = center + Math.floor(Math.random() * 5) - 2;
      var c = center + Math.floor(Math.random() * 5) - 2;
      if (r < 0 || c < 0 || r >= bd.size || c >= bd.size) continue;
      if (Core.get(bd, r, c) !== E) continue;
      Core.set(bd, r, c, p);
      if (Core.findWin(bd, r, c)) { Core.set(bd, r, c, E); continue; }
      break;
    }
    p = Core.other(p);
  }
  return p;
}

function playGame(levelBlack, levelWhite) {
  var bd = Core.createBoard();
  var player = randomOpening(bd, 4);
  var moves = 4;

  while (moves <= 225) {
    var mv = Core.chooseMove(bd, player, player === B ? levelBlack : levelWhite);
    assert.strictEqual(Core.get(bd, mv.r, mv.c), E,
      'AI 落子到了非空点位 ' + Core.toNotation(mv.r, mv.c));
    Core.set(bd, mv.r, mv.c, player);
    moves++;

    if (Core.findWin(bd, mv.r, mv.c)) {
      return { winner: player, moves: moves };
    }
    if (Core.isFull(bd)) {
      assert.strictEqual(bruteWinner(bd), 0, '全盘结束但暴力扫描发现五连，说明胜负判定漏判');
      return { winner: 0, moves: moves };
    }
    player = Core.other(player);
  }
  assert.fail('对局超过 225 手仍未结束');
}

test('AI 自我对弈：落子合法、能正常结束、胜负判定与暴力扫描一致', function () {
  ['hard', 'normal', 'easy'].forEach(function (level) {
    for (var game = 0; game < 3; game++) {
      var res = playGame(level, level === 'hard' ? 'normal' : 'hard');
      assert.ok(res.moves <= 225, level + ' 对局手数异常：' + res.moves);
    }
  });
});

test('难度分级有效：困难对简单保持明显优势', function () {
  var hardWins = 0;
  var games = 12;
  for (var g = 0; g < games; g++) {
    // 交替执黑，消除先手优势
    var hardIsBlack = g % 2 === 0;
    var res = hardIsBlack ? playGame('hard', 'easy') : playGame('easy', 'hard');
    if (res.winner === (hardIsBlack ? B : W)) hardWins++;
  }
  assert.ok(hardWins >= Math.ceil(games * 0.6),
    '困难难度仅胜 ' + hardWins + '/' + games + ' 局，难度分级可能失效');
  console.log('       （困难 vs 简单：' + hardWins + ' 胜 / ' + (games - hardWins) + ' 负或和）');
});

test('困难难度单步耗时在可接受范围', function () {
  var bd = Core.createBoard();
  var player = B;
  var worst = 0;
  for (var i = 0; i < 20; i++) {
    var t0 = Date.now();
    var mv = Core.chooseMove(bd, player, 'hard');
    worst = Math.max(worst, Date.now() - t0);
    assert.strictEqual(Core.get(bd, mv.r, mv.c), E, 'AI 应落在空位');
    Core.set(bd, mv.r, mv.c, player);
    if (Core.findWin(bd, mv.r, mv.c)) break;
    player = Core.other(player);
  }
  assert.ok(worst < 1000, '最慢一步耗时 ' + worst + 'ms，超出预期');
  console.log('       （20 手自我对弈中最慢一步 ' + worst + 'ms）');
});

test('坐标记号转换正确', function () {
  assert.strictEqual(Core.toNotation(7, 7), 'H8');
  assert.strictEqual(Core.toNotation(0, 0), 'A1');
  assert.strictEqual(Core.toNotation(14, 14), 'O15');
});

console.log('\n通过 ' + passed + ' 项测试' + (process.exitCode ? '，存在失败项' : '，全部通过') + '\n');
