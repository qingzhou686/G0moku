/*
 * 五子棋核心逻辑（纯函数，不依赖 DOM）
 * 既可在浏览器中通过 window.GomokuCore 使用，也可在 Node 中 require 做测试。
 */
(function (global) {
  'use strict';

  var SIZE = 15;
  var EMPTY = 0;
  var BLACK = 1;
  var WHITE = 2;
  var DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

  // 单点评分表（按形成棋形的强弱排序）
  var S = {
    FIVE: 10000000,
    OPEN_FOUR: 1000000,
    FOUR: 10000,      // 冲四：一端被堵
    OPEN_THREE: 8000, // 活三
    THREE: 1000,      // 眠三
    OPEN_TWO: 800,
    TWO: 100,
    ONE: 10
  };

  function createBoard(size) {
    var n = size || SIZE;
    return { size: n, cells: new Uint8Array(n * n) };
  }

  function idx(board, r, c) {
    return r * board.size + c;
  }

  function inBounds(board, r, c) {
    return r >= 0 && c >= 0 && r < board.size && c < board.size;
  }

  function get(board, r, c) {
    return inBounds(board, r, c) ? board.cells[idx(board, r, c)] : -1;
  }

  function set(board, r, c, v) {
    board.cells[idx(board, r, c)] = v;
  }

  function clone(board) {
    return { size: board.size, cells: board.cells.slice() };
  }

  function other(player) {
    return player === BLACK ? WHITE : BLACK;
  }

  /** 从 (r,c) 出发检查是否连成五子，返回取胜的坐标数组，否则 null。 */
  function findWin(board, r, c) {
    var player = get(board, r, c);
    if (player <= 0) return null;

    for (var d = 0; d < DIRS.length; d++) {
      var dr = DIRS[d][0];
      var dc = DIRS[d][1];
      var line = [[r, c]];

      for (var sign = -1; sign <= 1; sign += 2) {
        var i = 1;
        while (get(board, r + dr * i * sign, c + dc * i * sign) === player) {
          line.push([r + dr * i * sign, c + dc * i * sign]);
          i++;
        }
      }

      if (line.length >= 5) {
        line.sort(function (a, b) {
          return a[0] === b[0] ? a[1] - b[1] : a[0] - b[0];
        });
        return line;
      }
    }
    return null;
  }

  function isFull(board) {
    for (var i = 0; i < board.cells.length; i++) {
      if (board.cells[i] === EMPTY) return false;
    }
    return true;
  }

  /**
   * 在 (r,c) 落子后，该点对 player 的价值。
   * 统计四个方向上的连子数与两端封堵情况，按棋形查表累加。
   */
  function evaluatePoint(bd, r, c, player) {
    if (get(bd, r, c) !== EMPTY) return 0;
    var total = 0;

    for (var d = 0; d < DIRS.length; d++) {
      var dr = DIRS[d][0];
      var dc = DIRS[d][1];
      var count = 1;
      var openEnds = 0;
      var gapBonus = 0;

      for (var sign = -1; sign <= 1; sign += 2) {
        var step = 1;
        while (get(bd, r + dr * step * sign, c + dc * step * sign) === player) {
          count++;
          step++;
        }
        var nr = r + dr * step * sign;
        var nc = c + dc * step * sign;
        if (inBounds(bd, nr, nc) && get(bd, nr, nc) === EMPTY) {
          openEnds++;
          // 隔一格的己方棋子（跳三/跳四的雏形）给予少量加成
          var fr = nr + dr * sign;
          var fc = nc + dc * sign;
          if (get(bd, fr, fc) === player) gapBonus += 1;
        }
      }

      var score;
      if (count >= 5) score = S.FIVE;
      else if (count === 4) score = openEnds === 2 ? S.OPEN_FOUR : openEnds === 1 ? S.FOUR : 0;
      else if (count === 3) score = openEnds === 2 ? S.OPEN_THREE : openEnds === 1 ? S.THREE : 0;
      else if (count === 2) score = openEnds === 2 ? S.OPEN_TWO : openEnds === 1 ? S.TWO : 0;
      else score = openEnds === 2 ? S.ONE : openEnds > 0 ? 2 : 0;

      total += score + gapBonus * 12;
    }
    return total;
  }

  /** 生成候选点：已有棋子周围 2 格内的空点（空盘则取天元）。 */
  function candidateMoves(bd, radius) {
    var rad = radius || 2;
    var out = [];
    var hasStone = false;
    var center = Math.floor(bd.size / 2);

    for (var i = 0; i < bd.cells.length; i++) {
      if (bd.cells[i] !== EMPTY) { hasStone = true; break; }
    }
    if (!hasStone) return [[center, center]];

    for (var r = 0; r < bd.size; r++) {
      for (var c = 0; c < bd.size; c++) {
        if (get(bd, r, c) !== EMPTY) continue;
        var near = false;
        for (var rr = Math.max(0, r - rad); rr <= Math.min(bd.size - 1, r + rad) && !near; rr++) {
          for (var cc = Math.max(0, c - rad); cc <= Math.min(bd.size - 1, c + rad); cc++) {
            if (bd.cells[idx(bd, rr, cc)] !== EMPTY) { near = true; break; }
          }
        }
        if (near) out.push([r, c]);
      }
    }
    return out;
  }

  function countNeighbors(bd, r, c, radius) {
    var rad = radius || 2;
    var n = 0;
    for (var rr = Math.max(0, r - rad); rr <= Math.min(bd.size - 1, r + rad); rr++) {
      for (var cc = Math.max(0, c - rad); cc <= Math.min(bd.size - 1, c + rad); cc++) {
        if (bd.cells[idx(bd, rr, cc)] !== EMPTY) n++;
      }
    }
    return n;
  }

  /**
   * 为某一方排出候选点及其攻防价值。
   * attack：我方在此落子的价值；defend：对方在此落子的价值（即我堵住对方的价值）。
   */
  function scoreMoves(bd, player, limit) {
    var opp = other(player);
    var cands = candidateMoves(bd);
    var list = [];

    for (var k = 0; k < cands.length; k++) {
      var r = cands[k][0];
      var c = cands[k][1];
      var attack = evaluatePoint(bd, r, c, player);
      var defend = evaluatePoint(bd, r, c, opp);
      var value = attack * 1.12 + defend + countNeighbors(bd, r, c) * 2;
      list.push({ r: r, c: c, attack: attack, defend: defend, value: value });
    }

    list.sort(function (a, b) { return b.value - a.value; });
    return limit ? list.slice(0, limit) : list;
  }

  /** 找到能立刻五连的点。 */
  function findImmediateWin(bd, player, cands) {
    var list = cands || candidateMoves(bd);
    for (var i = 0; i < list.length; i++) {
      var r = list[i][0];
      var c = list[i][1];
      set(bd, r, c, player);
      var win = findWin(bd, r, c);
      set(bd, r, c, EMPTY);
      if (win) return { r: r, c: c };
    }
    return null;
  }

  /** 站在当前局面，某一方下一步能直接连五的点有几个（≥2 即无法被单点封堵）。 */
  function countWinningPoints(bd, player) {
    var cands = candidateMoves(bd);
    var count = 0;
    for (var i = 0; i < cands.length; i++) {
      var r = cands[i][0];
      var c = cands[i][1];
      set(bd, r, c, player);
      var win = findWin(bd, r, c);
      set(bd, r, c, EMPTY);
      if (win) count++;
    }
    return count;
  }

  /**
   * 判断 player 是否能在两步内制造出「双成五点」（对手封不住）。
   * 先用棋形分粗筛，避免对每个空点都做完整推演。
   */
  function canMakeDoubleThreat(bd, player) {
    var cands = candidateMoves(bd);
    for (var i = 0; i < cands.length; i++) {
      var r = cands[i][0];
      var c = cands[i][1];
      // 只有至少能形成活三/冲四的点，才可能一步造就双杀
      if (evaluatePoint(bd, r, c, player) < S.OPEN_THREE) continue;
      set(bd, r, c, player);
      var win = findWin(bd, r, c);
      var doubleThreat = !win && countWinningPoints(bd, player) >= 2;
      set(bd, r, c, EMPTY);
      if (win || doubleThreat) return true;
    }
    return false;
  }

  function pick(list) {
    return { r: list[0].r, c: list[0].c };
  }

  /**
   * 选择 AI 落子点。
   * difficulty: 'easy' | 'normal' | 'hard'
   */
  function chooseMove(bd, player, difficulty) {
    var level = difficulty || 'normal';
    var opp = other(player);
    var work = clone(bd);
    var all = candidateMoves(work);
    var i;

    // 1. 自己能赢就赢
    var win = findImmediateWin(work, player, all);
    if (win) return win;

    // 2. 对方能赢就堵（简单难度会漏看，保留可玩性）
    var threat = findImmediateWin(work, opp, all);
    if (threat) {
      if (level === 'hard' || level === 'normal') return threat;
      if (Math.random() < 0.5) return threat;
    }

    var scored = scoreMoves(work, player);
    if (!scored.length) {
      var center = Math.floor(work.size / 2);
      return { r: center, c: center };
    }

    // 简单：带噪声地在偏好点里挑，偶尔完全随机，因此人类容易取胜
    if (level === 'easy') {
      if (Math.random() < 0.3) {
        var loose = candidateMoves(work);
        var rp = loose[Math.floor(Math.random() * loose.length)];
        return { r: rp[0], c: rp[1] };
      }
      var noisy = scored.map(function (item) {
        return { r: item.r, c: item.c, value: item.value * (0.4 + Math.random()) };
      }).sort(function (a, b) { return b.value - a.value; });
      var poolSize = Math.min(noisy.length, Math.max(2, Math.min(6, Math.ceil(noisy.length * 0.35))));
      var chosen = noisy[Math.floor(Math.random() * poolSize)];
      return { r: chosen.r, c: chosen.c };
    }

    if (level === 'normal') return pick(scored);

    // hard：在贪心评分的基础上增加两层判断
    //   a. 杀招：某一手能让我下一手出现两个成五点，对手无法同时封堵
    //   b. 避免走进对手两步杀的局面
    var top = scored.slice(0, 10);
    for (i = 0; i < top.length; i++) {
      var mv = top[i];
      set(work, mv.r, mv.c, player);
      var myWin = findWin(work, mv.r, mv.c);
      if (myWin) { set(work, mv.r, mv.c, EMPTY); return { r: mv.r, c: mv.c }; }

      var kill = !findImmediateWin(work, opp) && countWinningPoints(work, player) >= 2;
      set(work, mv.r, mv.c, EMPTY);
      if (kill) return { r: mv.r, c: mv.c };
    }

    var safe = top.filter(function (cand) {
      set(work, cand.r, cand.c, player);
      var losing = !!findImmediateWin(work, opp) || canMakeDoubleThreat(work, opp);
      set(work, cand.r, cand.c, EMPTY);
      return !losing;
    });
    return pick(safe.length ? safe : scored);
  }

  /** 棋盘坐标 → 人类可读记号，例如 (7,7) → H8 */
  function toNotation(r, c) {
    return String.fromCharCode(65 + c) + (r + 1);
  }

  var API = {
    SIZE: SIZE,
    EMPTY: EMPTY,
    BLACK: BLACK,
    WHITE: WHITE,
    SCORES: S,
    createBoard: createBoard,
    clone: clone,
    get: get,
    set: set,
    other: other,
    findWin: findWin,
    isFull: isFull,
    evaluatePoint: evaluatePoint,
    candidateMoves: candidateMoves,
    findImmediateWin: findImmediateWin,
    countWinningPoints: countWinningPoints,
    canMakeDoubleThreat: canMakeDoubleThreat,
    scoreMoves: scoreMoves,
    chooseMove: chooseMove,
    toNotation: toNotation
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.GomokuCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
