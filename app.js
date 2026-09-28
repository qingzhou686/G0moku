/* 五子棋界面：Canvas 绘制 + 交互 + 人机对战调度 */
(function () {
  'use strict';

  var Core = window.GomokuCore;
  var SIZE = Core.SIZE;
  var EMPTY = Core.EMPTY;
  var BLACK = Core.BLACK;
  var WHITE = Core.WHITE;
  var STAR_POINTS = [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]];

  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var bgCanvas = document.createElement('canvas');
  var bgCtx = bgCanvas.getContext('2d');

  var el = {
    turnDot: document.getElementById('turnDot'),
    statusText: document.getElementById('statusText'),
    statusSub: document.getElementById('statusSub'),
    scoreBlack: document.getElementById('scoreBlack'),
    scoreWhite: document.getElementById('scoreWhite'),
    scoreDraw: document.getElementById('scoreDraw'),
    history: document.getElementById('history'),
    thinking: document.getElementById('thinking'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlayTitle'),
    overlayText: document.getElementById('overlayText'),
    overlayAgain: document.getElementById('overlayAgain'),
    overlayClose: document.getElementById('overlayClose'),
    undoBtn: document.getElementById('undoBtn'),
    restartBtn: document.getElementById('restartBtn'),
    aiOptions: document.getElementById('aiOptions'),
    sideSelect: document.getElementById('sideSelect'),
    levelSelect: document.getElementById('levelSelect'),
    coordToggle: document.getElementById('coordToggle'),
    soundBtn: document.getElementById('soundBtn')
  };

  var state = {
    board: Core.createBoard(),
    current: BLACK,
    history: [],
    over: false,
    winningLine: null,
    winner: null,
    mode: 'pve',
    humanColor: BLACK,
    level: 'normal',
    showCoords: true,
    soundOn: true,
    thinking: false,
    hover: null,
    scores: { black: 0, white: 0, draw: 0 }
  };

  var geometry = { size: 0, inset: 0, cell: 0, dpr: 1 };

  /* ---------------- 尺寸与静态背景 ---------------- */

  function computeGeometry() {
    var rect = canvas.getBoundingClientRect();
    var cssSize = Math.max(240, rect.width || canvas.clientWidth || 600);
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    var inset = cssSize * (state.showCoords ? 0.058 : 0.032);
    var cell = (cssSize - inset * 2) / (SIZE - 1);

    geometry.size = cssSize;
    geometry.inset = inset;
    geometry.cell = cell;
    geometry.dpr = dpr;

    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    canvas.style.height = cssSize + 'px';
    bgCanvas.width = canvas.width;
    bgCanvas.height = canvas.height;

    buildBackground();
  }

  function pos(i) {
    return geometry.inset + i * geometry.cell;
  }

  function clientToCell(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width) return null;
    var scale = geometry.size / rect.width;
    var x = (clientX - rect.left) * scale;
    var y = (clientY - rect.top) * scale;
    var c = Math.round((x - geometry.inset) / geometry.cell);
    var r = Math.round((y - geometry.inset) / geometry.cell);
    if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return null;
    var dx = x - pos(c);
    var dy = y - pos(r);
    if (Math.sqrt(dx * dx + dy * dy) > geometry.cell * 0.62) return null;
    return { r: r, c: c };
  }

  // 背景只在与尺寸相关时重建：木纹 + 网格 + 星位 + 坐标
  function buildBackground() {
    var size = geometry.size;
    var inset = geometry.inset;
    var cell = geometry.cell;
    var dpr = geometry.dpr;
    var c = bgCtx;

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, size, size);

    var wood = c.createLinearGradient(0, 0, size, size);
    wood.addColorStop(0, '#f1d29c');
    wood.addColorStop(0.45, '#e3b877');
    wood.addColorStop(1, '#cd9750');
    c.fillStyle = wood;
    c.fillRect(0, 0, size, size);

    // 木纹：几条半透明曲线，用固定种子的噪声保证每次重绘一致
    var seed = 20240501;
    function rnd() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }
    c.save();
      c.globalAlpha = 0.04;
    for (var g = 0; g < 46; g++) {
      var y0 = rnd() * size;
      var amp = 4 + rnd() * 16;
      c.beginPath();
      c.moveTo(0, y0);
      for (var x = 0; x <= size; x += size / 8) {
        c.lineTo(x, y0 + Math.sin((x / size) * Math.PI * (1 + rnd() * 0.4)) * amp);
      }
      c.strokeStyle = g % 3 === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(120,74,20,0.9)';
      c.lineWidth = 0.6 + rnd() * 1.6;
      c.stroke();
    }
    c.restore();

    // 边缘暗角
    var vignette = c.createRadialGradient(size / 2, size / 2, size * 0.32, size / 2, size / 2, size * 0.76);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(88,52,10,0.18)');
    c.fillStyle = vignette;
    c.fillRect(0, 0, size, size);

    // 网格
    c.strokeStyle = 'rgba(74,48,18,0.78)';
    c.lineWidth = Math.max(0.8, size / 620);
    c.beginPath();
    for (var i = 0; i < SIZE; i++) {
      c.moveTo(pos(i), pos(0));
      c.lineTo(pos(i), pos(SIZE - 1));
      c.moveTo(pos(0), pos(i));
      c.lineTo(pos(SIZE - 1), pos(i));
    }
    c.stroke();

    // 外框加粗
    c.lineWidth = Math.max(1.6, size / 320);
    c.strokeStyle = 'rgba(62,38,12,0.86)';
    c.strokeRect(pos(0), pos(0), pos(SIZE - 1) - pos(0), pos(SIZE - 1) - pos(0));

    // 星位
    c.fillStyle = 'rgba(58,36,12,0.88)';
    var starRadius = Math.max(2, cell * 0.075);
    STAR_POINTS.forEach(function (p) {
      c.beginPath();
      c.arc(pos(p[1]), pos(p[0]), starRadius, 0, Math.PI * 2);
      c.fill();
    });

    // 坐标
    if (state.showCoords) {
      c.fillStyle = 'rgba(70,44,16,0.7)';
      c.font = Math.max(9, cell * 0.34) + 'px "Segoe UI", system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (var k = 0; k < SIZE; k++) {
        c.fillText(String.fromCharCode(65 + k), pos(k), inset * 0.5);
        c.fillText(String.fromCharCode(65 + k), pos(k), size - inset * 0.5);
        c.fillText(String(k + 1), inset * 0.5, pos(k));
        c.fillText(String(k + 1), size - inset * 0.5, pos(k));
      }
    }
  }

  /* ---------------- 绘制 ---------------- */

  function drawStone(r, c, player, options) {
    var opts = options || {};
    var x = pos(c);
    var y = pos(r);
    var radius = geometry.cell * 0.46;
    var c2 = ctx;

    if (opts.ghost) {
      c2.save();
      c2.globalAlpha = player === BLACK ? 0.3 : 0.45;
      c2.beginPath();
      c2.arc(x, y, radius, 0, Math.PI * 2);
      c2.fillStyle = player === BLACK ? '#2a2d34' : '#fbf8f1';
      c2.fill();
      c2.restore();
      return;
    }

    c2.save();
    c2.beginPath();
    c2.arc(x + radius * 0.08, y + radius * 0.18, radius * 1.02, 0, Math.PI * 2);
    c2.fillStyle = 'rgba(60,34,8,0.28)';
    c2.filter = 'blur(' + Math.max(1, radius * 0.14) + 'px)';
    c2.fill();
    c2.restore();

    var g = c2.createRadialGradient(
      x - radius * 0.35, y - radius * 0.4, radius * 0.1,
      x, y, radius * 1.12
    );
    if (player === BLACK) {
      g.addColorStop(0, '#6f7583');
      g.addColorStop(0.35, '#31353d');
      g.addColorStop(1, '#0b0c10');
    } else {
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.55, '#f6f2e9');
      g.addColorStop(1, '#cfc7b6');
    }

    c2.beginPath();
    c2.arc(x, y, radius, 0, Math.PI * 2);
    c2.fillStyle = g;
    c2.fill();
    c2.lineWidth = Math.max(0.7, radius * 0.055);
    c2.strokeStyle = player === BLACK ? 'rgba(255,255,255,0.14)' : 'rgba(120,105,80,0.5)';
    c2.stroke();

    // 高光
    c2.beginPath();
    c2.ellipse(x - radius * 0.3, y - radius * 0.36, radius * 0.3, radius * 0.2, -0.7, 0, Math.PI * 2);
    c2.fillStyle = player === BLACK ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';
    c2.fill();
  }

  function draw() {
    var size = geometry.size;
    var dpr = geometry.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bgCanvas, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 落子
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var v = Core.get(state.board, r, c);
        if (v !== EMPTY) drawStone(r, c, v);
      }
    }

    // 最后一手标记
    var last = state.history[state.history.length - 1];
    if (last && !state.over) {
      ctx.beginPath();
      ctx.arc(pos(last.c), pos(last.r), geometry.cell * 0.13, 0, Math.PI * 2);
      ctx.fillStyle = last.player === BLACK ? '#e8b45c' : '#c2410c';
      ctx.fill();
    }

    // 五连高亮
    if (state.winningLine) {
      var line = state.winningLine;
      var first = line[0];
      var lastP = line[line.length - 1];
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 205, 96, 0.95)';
      ctx.lineWidth = Math.max(3, geometry.cell * 0.12);
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(255, 196, 70, 0.85)';
      ctx.shadowBlur = geometry.cell * 0.5;
      ctx.beginPath();
      ctx.moveTo(pos(first[1]), pos(first[0]));
      ctx.lineTo(pos(lastP[1]), pos(lastP[0]));
      ctx.stroke();
      ctx.restore();

      line.forEach(function (p) {
        ctx.beginPath();
        ctx.arc(pos(p[1]), pos(p[0]), geometry.cell * 0.49, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 214, 120, 0.95)';
        ctx.lineWidth = Math.max(2, geometry.cell * 0.07);
        ctx.stroke();
      });
    }

    // 悬停预览
    if (state.hover && !state.over && !state.thinking && isHumanTurn() &&
        Core.get(state.board, state.hover.r, state.hover.c) === EMPTY) {
      drawStone(state.hover.r, state.hover.c, state.current, { ghost: true });
    }

    // 棋盘外发光边框
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  }

  /* ---------------- 音效 ---------------- */

  var audioCtx = null;
  function playSound(player) {
    if (!state.soundOn) return;
    try {
      if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var t = audioCtx.currentTime;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = 'triangle';
      var base = player === BLACK ? 320 : 430;
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 0.55, t + 0.09);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.14, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    } catch (e) { /* 音效失败不影响对局 */ }
  }

  /* ---------------- 状态与 UI 同步 ---------------- */

  function isHumanTurn() {
    return state.mode === 'pvp' || state.current === state.humanColor;
  }

  function colorName(player) {
    return player === BLACK ? '黑棋' : '白棋';
  }

  function renderStatus() {
    var dotClass = state.current === BLACK ? 'black' : 'white';
    el.turnDot.className = 'turn-dot ' + dotClass + (state.over ? ' win' : '');

    if (state.over) {
      if (state.winner === 'draw') {
        el.statusText.textContent = '和棋';
        el.statusSub.textContent = '棋盘已满，本局平局';
      } else {
        el.statusText.textContent = colorName(state.winner) + '获胜';
        el.statusSub.textContent = '共 ' + state.history.length + ' 手，点击「重新开始」再来一盘';
      }
      return;
    }

    if (state.mode === 'pve') {
      var mine = state.current === state.humanColor;
      el.statusText.textContent = mine
        ? '轮到你了（' + colorName(state.current) + '）'
        : 'AI 回合（' + colorName(state.current) + '）';
      el.statusSub.textContent = mine ? '点击棋盘交叉点落子' : '正在计算最佳位置…';
    } else {
      el.statusText.textContent = colorName(state.current) + '回合';
      el.statusSub.textContent = '黑棋先行，轮流落子';
    }
  }

  function renderScores() {
    el.scoreBlack.textContent = state.scores.black;
    el.scoreWhite.textContent = state.scores.white;
    el.scoreDraw.textContent = state.scores.draw;
  }

  function renderHistory() {
    if (!state.history.length) {
      el.history.innerHTML = '<li class="empty">还没有落子记录</li>';
      return;
    }
    var html = '';
    for (var i = 0; i < state.history.length; i++) {
      var m = state.history[i];
      var latest = i === state.history.length - 1 ? ' class="latest"' : '';
      html += '<li' + latest + '><span class="no">' + (i + 1) + '</span>' +
        '<span class="dot ' + (m.player === BLACK ? 'black' : 'white') + '"></span>' +
        '<span>' + Core.toNotation(m.r, m.c) + '</span></li>';
    }
    el.history.innerHTML = html;
    el.history.scrollTop = el.history.scrollHeight;
  }

  function renderControls() {
    canvas.classList.toggle('locked',
      state.over || state.thinking || !isHumanTurn());
    el.undoBtn.disabled = state.thinking || state.history.length === 0;
    el.thinking.hidden = !state.thinking;
  }

  function render() {
    renderStatus();
    renderHistory();
    renderControls();
    renderScores();
    draw();
  }

  /* ---------------- 对局流程 ---------------- */

  function resetGame(options) {
    var opts = options || {};
    state.board = Core.createBoard();
    state.current = BLACK;
    state.history = [];
    state.over = false;
    state.winningLine = null;
    state.winner = null;
    state.thinking = false;
    state.hover = null;
    el.overlay.hidden = true;
    if (opts.resetScores) {
      state.scores = { black: 0, white: 0, draw: 0 };
    }
    render();
    maybeAiMove();
  }

  function place(r, c, player) {
    Core.set(state.board, r, c, player);
    state.history.push({ r: r, c: c, player: player });

    var win = Core.findWin(state.board, r, c);
    if (win) {
      state.over = true;
      state.winner = player;
      state.winningLine = win;
      if (player === BLACK) state.scores.black++;
      else state.scores.white++;
      showOverlay(colorName(player) + '获胜', '共 ' + state.history.length + ' 手 · ' +
        Core.toNotation(win[0][0], win[0][1]) + ' → ' + Core.toNotation(win[4][0], win[4][1]));
      playSound(player);
      render();
      return true;
    }

    if (Core.isFull(state.board)) {
      state.over = true;
      state.winner = 'draw';
      state.scores.draw++;
      showOverlay('和棋', '棋盘已满，双方均未连成五子');
      render();
      return true;
    }

    state.current = Core.other(player);
    playSound(player);
    render();
    return false;
  }

  function showOverlay(title, text) {
    el.overlayTitle.textContent = title;
    el.overlayText.textContent = text;
    el.overlay.hidden = false;
  }

  function maybeAiMove() {
    if (state.mode !== 'pve' || state.over) return;
    if (state.current === state.humanColor) return;

    state.thinking = true;
    render();

    // 让出主线程，先把「思考中」画出来
    window.setTimeout(function () {
      var move = Core.chooseMove(state.board, state.current, state.level);
      state.thinking = false;
      if (move && Core.get(state.board, move.r, move.c) === EMPTY) {
        place(move.r, move.c, state.current);
      } else {
        render();
      }
    }, 160);
  }

  function handleHumanMove(r, c) {
    if (state.over || state.thinking || !isHumanTurn()) return;
    if (Core.get(state.board, r, c) !== EMPTY) return;
    state.hover = null;
    var finished = place(r, c, state.current);
    if (!finished) maybeAiMove();
  }

  function undo() {
    if (state.thinking || !state.history.length) return;

    function popMove() {
      var m = state.history.pop();
      Core.set(state.board, m.r, m.c, EMPTY);
    }

    popMove();
    // 人机模式下继续回退，直到重新轮到人类落子
    if (state.mode === 'pve') {
      while (state.history.length) {
        var nextTurn = Core.other(state.history[state.history.length - 1].player);
        if (nextTurn === state.humanColor) break;
        popMove();
      }
    }

    state.over = false;
    state.winner = null;
    state.winningLine = null;
    state.current = state.history.length
      ? Core.other(state.history[state.history.length - 1].player)
      : BLACK;
    el.overlay.hidden = true;
    render();

    // 极端情况下（例如 AI 执黑开局）继续让 AI 走
    maybeAiMove();
  }

  /* ---------------- 事件绑定 ---------------- */

  canvas.addEventListener('mousemove', function (e) {
    var cellPos = clientToCell(e.clientX, e.clientY);
    var changed = (!!cellPos !== !!state.hover) ||
      (cellPos && state.hover && (cellPos.r !== state.hover.r || cellPos.c !== state.hover.c));
    if (changed) {
      state.hover = cellPos;
      draw();
    }
  });

  canvas.addEventListener('mouseleave', function () {
    if (state.hover) {
      state.hover = null;
      draw();
    }
  });

  canvas.addEventListener('click', function (e) {
    var cellPos = clientToCell(e.clientX, e.clientY);
    if (cellPos) handleHumanMove(cellPos.r, cellPos.c);
  });

  document.querySelectorAll('.seg').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.classList.contains('active')) return;
      document.querySelectorAll('.seg').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      el.aiOptions.classList.toggle('hidden', state.mode !== 'pve');
      resetGame({ resetScores: true });
    });
  });

  el.sideSelect.addEventListener('change', function () {
    state.humanColor = el.sideSelect.value === 'black' ? BLACK : WHITE;
    resetGame({ resetScores: true });
  });

  el.levelSelect.addEventListener('change', function () {
    state.level = el.levelSelect.value;
  });

  el.restartBtn.addEventListener('click', function () { resetGame({ resetScores: true }); });
  el.undoBtn.addEventListener('click', undo);
  el.overlayAgain.addEventListener('click', function () { resetGame({ resetScores: true }); });
  el.overlayClose.addEventListener('click', function () { el.overlay.hidden = true; });
  el.overlay.addEventListener('click', function (e) {
    if (e.target === el.overlay) el.overlay.hidden = true;
  });

  el.coordToggle.addEventListener('change', function () {
    state.showCoords = el.coordToggle.checked;
    computeGeometry();
    draw();
  });

  el.soundBtn.addEventListener('click', function () {
    state.soundOn = !state.soundOn;
    el.soundBtn.setAttribute('aria-pressed', String(state.soundOn));
    if (state.soundOn) playSound(BLACK);
  });

  document.addEventListener('keydown', function (e) {
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'u' || e.key === 'U') { undo(); }
    else if (e.key === 'r' || e.key === 'R') { resetGame({ resetScores: true }); }
    else if (e.code === 'Space') {
      e.preventDefault();
      el.soundBtn.click();
    } else if (e.key === 'Escape') {
      el.overlay.hidden = true;
    }
  });

  function handleResize() {
    var width = canvas.getBoundingClientRect().width;
    if (Math.abs(width - geometry.size) < 0.5) return;
    computeGeometry();
    draw();
  }

  if (window.ResizeObserver) {
    new ResizeObserver(handleResize).observe(canvas.parentElement);
  }
  window.addEventListener('resize', handleResize);

  /* ---------------- 启动 ---------------- */

  computeGeometry();
  render();
})();
