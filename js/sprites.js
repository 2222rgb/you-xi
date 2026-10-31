/* =========================================================
   sprites.js — 像素美术资源
   全部用字符串点阵定义，运行时烘成离屏 canvas。
   字符含义见各 sprite 的 pal 表，'.' 为透明。
   ========================================================= */
(function (root) {
  'use strict';

  function S(pal, rows) { return { pal: pal, rows: rows, w: rows[0].length, h: rows.length }; }

  const SPRITES = {};

  /* ---------------- 主角：兜帽游侠 ---------------- */
  SPRITES.hero = S(
    { h: '#3b2f52', H: '#5c4a7a', s: '#e9c9a3', d: '#2a2036', c: '#2f4a3e', C: '#3f6353', p: '#22352b', b: '#1a1522', m: '#8c7150' },
    [
      '...hhhhhh...',
      '..hHHHHHHh..',
      '..hHssssHh..',
      '..hHsdsdHh..',
      '..hHssssHh..',
      '...hHHHHh...',
      '..cccccccc..',
      '.cCCCCCCCCc.',
      '.cCppppppCc.',
      '..cCppppCc..',
      '...cc..cc...',
      '...bb..bb...'
    ]
  );

  /* 走路帧：腿部换边 */
  SPRITES.hero2 = S(
    SPRITES.hero.pal,
    [
      '...hhhhhh...',
      '..hHHHHHHh..',
      '..hHssssHh..',
      '..hHsdsdHh..',
      '..hHssssHh..',
      '...hHHHHh...',
      '..cccccccc..',
      '.cCCCCCCCCc.',
      '.cCppppppCc.',
      '..cCppppCc..',
      '..bb....bb..',
      '..b......b..'
    ]
  );

  /* ---------------- 史莱姆 ---------------- */
  SPRITES.slime = S(
    { g: '#3f8a4a', G: '#5fbf63', d: '#1d3a24' },
    [
      '..........',
      '...GGGG...',
      '..GGGGGG..',
      '.GGGGGGGG.',
      '.GGdGGdGG.',
      '.GGGGGGGG.',
      '.GGGGGGGG.',
      '..GGGGGG..',
      '...dddd...',
      '..........'
    ]
  );

  /* ---------------- 蝙蝠 ---------------- */
  SPRITES.bat = S(
    { w: '#5a4a7a', W: '#8a76b0', e: '#ff4d6d' },
    [
      'w..........w',
      'ww...ww...ww',
      'www..ww..www',
      '.wwwwwwwwww.',
      '..wwWeeWww..',
      '...wWeeWw...',
      '....wwww....',
      '.....ww.....'
    ]
  );

  /* ---------------- 骷髅 ---------------- */
  SPRITES.skel = S(
    { w: '#d9d4c0', W: '#8f8a76', e: '#20202c' },
    [
      '...wwww...',
      '..wwwwww..',
      '..weewew..',
      '..wwwwww..',
      '...wwww...',
      '..w.ww.w..',
      '.wwwwwwww.',
      '..w.ww.w..',
      '..w.ww.w..',
      '...w..w...',
      '...w..w...',
      '..WW..WW..'
    ]
  );

  /* ---------------- 幽魂 ---------------- */
  SPRITES.wraith = S(
    { p: '#6a4a9a', P: '#a07ad9', e: '#67e8f9' },
    [
      '...pppp...',
      '..pppppp..',
      '..peppepp.',
      '..pppppp..',
      '.pppppppp.',
      '.pppppppp.',
      '.pppppppp.',
      '..pppppp..',
      '..p.pp.p..',
      '.p..pp..p.',
      '....p.p...',
      '..........'
    ]
  );

  /* ---------------- 巨兽 ---------------- */
  SPRITES.brute = S(
    { b: '#6b5a4a', B: '#8f7a63', d: '#2a2119', e: '#ff7043' },
    [
      '....bbbbbb....',
      '...bBBBBBBb...',
      '..bBeeeeeeBb..',
      '..bBBBBBBBBb..',
      '..bBdBBBBdBb..',
      '...bBBBBBBb...',
      '..bbbbbbbbbb..',
      '.bBBBBBBBBBBb.',
      '.bBBdBBBBdBBb.',
      '.bBBBBBBBBBBb.',
      '..bbBBBBBBbb..',
      '...bb....bb...',
      '..bb......bb..',
      '..bb......bb..'
    ]
  );

  /* ---------------- 首领：深渊之眼 ---------------- */
  SPRITES.boss = S(
    { k: '#2a0f14', K: '#4a1a22', r: '#c0392b', R: '#ff6b4a', e: '#ffe066', w: '#f5e6c8' },
    [
      '......kkkkkkkkkk......',
      '....kkKKKKKKKKKKkk....',
      '...kKKKKKKKKKKKKKKk...',
      '..kKKKKRRRRRRRRKKKKk..',
      '.kKKKRRRRRRRRRRRRKKKk.',
      '.kKKRRRwwwwwwwwRRRKKk.',
      'kKKKRRwwweeeewwwRRRKKk',
      'kKKKRRwwweeeewwwRRRKKk',
      'kKKKRRwwwwwwwwwwRRRKKk',
      '.kKKRRRwwwwwwwwRRRKKk.',
      '.kKKKRRRRRRRRRRRRKKKk.',
      '..kKKKKRRRRRRRRKKKKk..',
      '...kKKKKKKKKKKKKKKk...',
      '....kkKKKKKKKKKKkk....',
      '......kkkkkkkkkk......',
      '.....k.r.r.r.r.k......',
      '....kR.kR.kR.kRk......',
      '...kRk.kRk.kRk.kRk....',
      '..kRk...kRk...kRk.....',
      '..kk.....k.....kk.....'
    ]
  );

  /* ---------------- 拾取物 ---------------- */
  SPRITES.gem = S(
    { g: '#3fd0c9', G: '#7ef5ea', w: '#ffffff' },
    [
      '..GGG..',
      '.GwwwG.',
      'GwwgwwG',
      'GgggggG',
      '.GgggG.',
      '..GgG..',
      '...G...'
    ]
  );

  SPRITES.coin = S(
    { y: '#c8a45c', Y: '#f0d08a', d: '#7a5f2a' },
    [
      '..YYY..',
      '.YyyyY.',
      'YyYYYyY',
      'YyYdYyY',
      'YyYYYyY',
      '.YyyyY.',
      '..YYY..'
    ]
  );

  SPRITES.chest = S(
    { b: '#6b4a2a', B: '#9a7040', y: '#e0b84a', d: '#2a1a10' },
    [
      '..bbbbbbbb..',
      '.bBBBBBBBBb.',
      'bBByyyyyyBBb',
      'bBBBBBBBBBBb',
      'bBBBBddBBBBb',
      'bBBByyyyBBBb',
      'bBBBBBBBBBBb',
      '.bBBBBBBBBb.',
      '..bbbbbbbb..'
    ]
  );

  SPRITES.heart = S(
    { r: '#c0392b', R: '#ff6b6b', w: '#ffd1d1' },
    [
      '.RR...RR.',
      'RwwR.RRRR',
      'RwRRRRRRR',
      'RRRRRRRRR',
      '.RRRRRRR.',
      '..RRRRR..',
      '...RRR...',
      '....R....'
    ]
  );

  /* ---------------- 装备图标 12x12 ---------------- */
  SPRITES.icon_helm = S({ m: '#9aa4b8', M: '#cfd8e8', d: '#2a2f3a' },
    ['..MMMMMMMM..', '.MMmmmmmmMM.', 'MMmmmmmmmmMM', 'MMmmmddmmmMM', 'MMmmd..dmmMM', 'MMmmmmmmmmMM', 'MMmmmmmmmmMM', 'MMm.mmmm.mMM', 'MM..mmmm..MM', '.M..mmmm..M.', '....mmmm....', '....dddd....']);

  SPRITES.icon_body = S({ m: '#9aa4b8', M: '#cfd8e8', d: '#2a2f3a' },
    ['..MM....MM..', '.MMMM..MMMM.', 'MMMMMddMMMMM', 'MMMMMddMMMMM', 'MMMMMddMMMMM', '.MMMMddMMMM.', '..MMMddMMM..', '...MMddMM...', '....MddM....', '....MddM....', '....MddM....', '....dddd....']);

  SPRITES.icon_ring = S({ y: '#e0b84a', Y: '#fff0b0', d: '#7a5f2a' },
    ['....dddd....', '...dYYYYd...', '..dYYddYYd..', '.dYYd..dYYd.', '.dYd....dYd.', '.dYd....dYd.', '.dYYd..dYYd.', '..dYYddYYd..', '...dYYYYd...', '....dddd....', '............', '............']);

  SPRITES.icon_amulet = S({ y: '#e0b84a', Y: '#fff0b0', p: '#b07cff', P: '#e0c0ff', d: '#7a5f2a' },
    ['..d......d..', '.dYd....dYd.', '.dYd....dYd.', '..dYd..dYd..', '...dYddYd...', '....dYYd....', '...ddYYdd...', '..dYppppYd..', '..dYpPPpYd..', '..dYppppYd..', '...ddYYdd...', '.....dd.....']);

  SPRITES.icon_boot = S({ m: '#8a6a4a', M: '#b08a60', d: '#2a1a10' },
    ['...MMMM.....', '...MMMM.....', '...MMMM.....', '...MMMM.....', '...MMMM.....', '...MMMMMM...', '...MMMMMMMM.', '..MMMMMMMMMM', '..MMMMMMMMMM', '..dddddddddd', '............', '............']);

  /* ---------------- 技能图标 ---------------- */
  SPRITES.icon_dagger = S({ m: '#cfd8e8', M: '#ffffff', g: '#8a6a4a', d: '#2a2f3a' },
    ['.........MM.', '........Mmm.', '.......Mmm..', '......Mmm...', '.....Mmm....', '....Mmm.....', '...Mmm......', '..Mmm.......', '.ggm........', 'g.g.........', '............', '............']);

  SPRITES.icon_fire = S({ r: '#ff6b2b', R: '#ffb347', y: '#ffe066' },
    ['.....r......', '....rr......', '...rrr..r...', '..rrRr.rr...', '..rRRRrrr...', '.rrRRyyRRr..', '.rRRyyyyRRr.', '.rRRyYYyRRr.', '..rRRyyRRr..', '...rRRRRr...', '....rrrr....', '............']);

  SPRITES.icon_frost = S({ c: '#5fd0ff', C: '#bfefff', w: '#ffffff' },
    ['.....c......', '..c..c..c...', '...c.c.c....', '....ccc.....', 'cc..CwC..cc.', '..c.CwC.c...', '....CCC.....', '..c.CwC.c...', 'cc..CwC..cc.', '....ccc.....', '...c.c.c....', '..c..c..c...']);

  SPRITES.icon_bolt = S({ y: '#ffe066', Y: '#fff8c0', d: '#a07820' },
    ['......yy....', '.....yy.....', '....yy......', '...yyyyyy...', '......yy....', '.....yy.....', '....yy......', '...yy.......', '..yy........', '.y..........', '............', '............']);

  SPRITES.icon_axe = S({ m: '#cfd8e8', g: '#8a6a4a', d: '#2a2f3a' },
    ['...mmmm.....', '..mmmmmm....', '.mm....mm...', '.mm....mm...', '..mmmmmm....', '...mmmm.....', '....gg......', '....gg......', '....gg......', '....gg......', '....gg......', '............']);

  SPRITES.icon_meteor = S({ r: '#ff6b2b', R: '#ffb347', d: '#6b2a10' },
    ['r...........', '.rr.........', '..rrr.......', '...rrrr.....', '....rrrrr...', '.....RRRRr..', '....RRRRRRr.', '...RRRrrRRR.', '...RRr..rRR.', '...RRRrrRRR.', '....RRRRRR..', '.....rrrr...']);

  /* ---------------- 主城 NPC ---------------- */
  SPRITES.npc_merchant = S(
    { h: '#6b4a2a', H: '#8a6a3a', s: '#e0c49a', d: '#2a1f14', p: '#3a5a4a', g: '#c8a45c' },
    [
      '...hhhhhh...',
      '..hHHHHHHh..',
      '..hHssssHh..',
      '..hHsdsdHh..',
      '..hHssssHh..',
      '...hHHHHh...',
      '..pppppppp..',
      '.pppppppppp.',
      '.ppggggggpp.',
      '..pppppppp..',
      '...pp..pp...',
      '...dd..dd...'
    ]
  );

  SPRITES.npc_smith = S(
    { h: '#3a2a2a', H: '#5a3a3a', s: '#d8a878', d: '#20140f', a: '#7a3a2a', m: '#9aa4b8' },
    [
      '...hhhhhh...',
      '..hHHHHHHh..',
      '..hHssssHh..',
      '..hHsdsdHh..',
      '..hHssssHh..',
      '...hHHHHh...',
      '..aaaaaaaa..',
      '.aaaaaaaaaa.',
      '.aaaaaamaaa.',
      '..aaaaamaa..',
      '...aa..aa...',
      '...dd..dd...'
    ]
  );

  SPRITES.npc_market = S(
    { h: '#2a3a4a', H: '#3a5a6a', s: '#d8c8a8', d: '#141c24', r: '#8a4a5a', g: '#e0c060' },
    [
      '...hhhhhh...',
      '..hHHHHHHh..',
      '..hHssssHh..',
      '..hHsdsdHh..',
      '..hHssssHh..',
      '...hHHHHh...',
      '..rrrrrrrr..',
      '.rrrrrrrrrr.',
      '.rggggggggr.',
      '..rrrrrrrr..',
      '...rr..rr...',
      '...dd..dd...'
    ]
  );

  SPRITES.portal = S(
    { p: '#4a2a7a', P: '#8a5ad9', e: '#c9a0ff', w: '#ffffff', d: '#1a0a2a' },
    [
      '....dddd....',
      '..ddPPPPdd..',
      '.dPPeeeePPd.',
      '.dPeePPeePd.',
      'dPPePwwPePPd',
      'dPePwwwwPePd',
      'dPePwwwwPePd',
      'dPPePwwPePPd',
      '.dPeePPeePd.',
      '.dPPeeeePPd.',
      '..ddPPPPdd..',
      '....dddd....'
    ]
  );

  /* ---------------- 第二首领：骨王 ---------------- */
  SPRITES.boss2 = S(
    { b: '#d9d4c0', B: '#f2eddc', d: '#3a3428', r: '#c0392b', e: '#ff4d6d', g: '#e0c060' },
    [
      '....bbbbbbbbbbbb....',
      '...bBBBBBBBBBBBBb...',
      '..bBBBBBBBBBBBBBBb..',
      '..bBBeeBBBBBBeeBBb..',
      '..bBBeeBBBBBBeeBBb..',
      '..bBBBBBBBBBBBBBBb..',
      '..bBBBddddddddBBBb..',
      '..bBBdBBBBBBBBdBBb..',
      '...bBBBBBBBBBBBBb...',
      '....bbbbbbbbbbbb....',
      '..bBBBBBBBBBBBBBBb..',
      '.bBBBBBBBBBBBBBBBBb.',
      '.bBBbBBBBBBBBBBbBBb.',
      '.bBBbBBBBBBBBBBbBBb.',
      '.bBBbBBBBBBBBBBbBBb.',
      '..bb.bBBBBBBBBb.bb..',
      '.....bbbbbbbbbb.....',
      '....g..g..g..g......',
      '...gG.gG.gG.gGg.....',
      '..gG..g..g..g..g....'
    ]
  );

  /* ---------------- 喷吐者（远程） ---------------- */
  SPRITES.spitter = S(
    { g: '#4a7a3a', G: '#6aa84f', d: '#1e2e18', y: '#e0c060' },
    [
      '...gggg...',
      '..gGGGGg..',
      '..gGyGyg..',
      '..gGGGGg..',
      '.gGGGGGGg.',
      '.gGddddGg.',
      '.gGdGGdGg.',
      '..gGddGg..',
      '...gggg...',
      '..d.dd.d..'
    ]
  );
  /* ---------------- 数字字体 3x5 ---------------- */
  const DIGITS = {
    '0': ['111', '101', '101', '101', '111'],
    '1': ['010', '110', '010', '010', '111'],
    '2': ['111', '001', '111', '100', '111'],
    '3': ['111', '001', '111', '001', '111'],
    '4': ['101', '101', '111', '001', '001'],
    '5': ['111', '100', '111', '001', '111'],
    '6': ['111', '100', '111', '101', '111'],
    '7': ['111', '001', '010', '010', '010'],
    '8': ['111', '101', '111', '101', '111'],
    '9': ['111', '101', '111', '001', '111'],
    'k': ['101', '101', '110', '101', '101'],
    'm': ['000', '000', '111', '111', '101'],
    '+': ['000', '010', '111', '010', '000'],
    '.': ['000', '000', '000', '000', '010'],
    '-': ['000', '000', '111', '000', '000'],
    '!': ['010', '010', '010', '000', '010']
  };

  root.SPRITES = SPRITES;
  root.DIGITS = DIGITS;
})(window);
