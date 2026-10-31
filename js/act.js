/* =========================================================
   act.js — 统一动作层
   单机/主机：直接改状态；客户端：发给主机执行。
   ========================================================= */
(function (root) {
  'use strict';

  const ACT = { client: false };

  function resolve(st, player) { return player || st.players[st.localId] || st.players[0]; }

  /** 在本地执行一个动作 */
  function apply(st, name, a, player) {
    const SIM = root.SIM;
    const p = resolve(st, player);
    a = a || [];
    switch (name) {
      case 'allocate': return SIM.allocate(st, a[0], p);
      case 'resetTalents': return SIM.resetTalents(st, p);
      case 'equip': {
        const idx = a[0];
        const it = p.bag[idx];
        if (!it) return null;
        p.bag.splice(idx, 1);
        return SIM.equip(st, it, p);
      }
      case 'unequip': return SIM.unequip(st, a[0], p);
      case 'buy': return SIM.buyItem(st, a[0], p);
      case 'buyPotion': return SIM.buyPotion(st, p);
      case 'sell': return SIM.sellItem(st, a[0], p);
      case 'craft': return SIM.craft(st, a[0], a[1], p);
      case 'stashIn': return SIM.stashIn(st, a[0], p);
      case 'stashOut': return SIM.stashOut(st, a[0], p);
      case 'marketBuy': return SIM.marketBuy(st, a[0], p);
      case 'gamble': return SIM.gamble(st, a[0], p);
      case 'enhance': return SIM.enhance(st, a[0], p);
      case 'salvage': return SIM.salvage(st, a[0], p);
      case 'drop': return SIM.dropItem(st, a[0], p);
      case 'rune': return SIM.setRune(st, a[0], a[1], p);
      case 'cast': return SIM.castSkill(st, a[0], p);
      case 'support': return SIM.setSupport(st, a[0], a[1], p);
      case 'setskill': return SIM.setSkill(st, a[0], a[1], p);
      case 'rogue': return SIM.pickRogue(st, a[0], p);
      case 'statue': return SIM.activateStatue(st, p);
      case 'giveup': return SIM.giveUp(st, p);
      case 'potion': return SIM.drinkPotion(st, p);
      case 'leave': return SIM.interact(st);
      case 'take': return SIM.takeItem(st, p);
      case 'openBox': return SIM.openBox(st, p);
      default: return null;
    }
  }

  /** UI 调这个；客户端会自动转发给主机 */
  ACT.run = function (st, name, a, player) {
    if (ACT.client) {
      root.NET.sendCmd(name, a || []);
      return null;
    }
    return apply(st, name, a, player);
  };

  ACT.applyLocal = apply;
  root.ACT = ACT;
})(window);
