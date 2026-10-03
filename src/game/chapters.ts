import { MAX_HP, newState, type GameState } from './state';
import { act3Flags } from './act3';

// Where each act starts. The title screen's chapter select, the debug API and the automated playthroughs
// all start an act from these definitions.

/** Everything the first act leaves behind, just before the black stone goes into the furnace. */
export function beforeTheFurnace(): GameState {
  const s = newState();
  Object.assign(s.flags, {
    power: true,
    barricadeMoved: true,
    cabinUnlocked: true,
    safeOpen: true,
    sosSent: true,
    wtOpen: true,
    'got:crowbar': true,
    'got:axe': true,
    'got:idol': true,
    'got:brandy1': true,
    'got:cabinKey': true,
    'got:logPage': true,
    'got:diary': true,
    'got:engineerNotes': true,
    'got:crank': true,
    'got:captainLog': true,
    engineSeen: true,
    holdSeen: true,
    axeTaken: true,
    engAmbush: true,
  });
  s.inv = ['lantern', 'commission', 'crowbar', 'axe', 'crank', 'captainLog', 'idol', 'brandy1'];
  s.docs = ['commission', 'logPage', 'diary', 'engineerNotes', 'captainLog'];
  s.push['corridor:barricade'] = [-7.35, -1.15];
  s.equipped = 'axe';
  s.room = 'engine';
  s.spawn = 'fromHold';
  s.x = -3.2;
  s.z = 2.6;
  s.h = 0;
  return s;
}

/**
 * The third act: four months on, at Bell Cove. Only the time played, the tallies and the documents read
 * carry over from `prev`; `pell` says whether the operator came off the Thalassa with you.
 */
export function landfallState(pell: boolean, prev?: GameState): GameState {
  const s = newState();
  if (prev) {
    s.time = prev.time;
    s.saves = prev.saves;
    s.deaths = prev.deaths;
    s.docs = [...prev.docs];
  }
  s.room = 'station';
  s.spawn = 'arrive';
  s.hp = MAX_HP;
  s.inv = ['lantern', 'telegram'];
  s.equipped = null;
  s.flags = act3Flags(pell, s.time);
  return s;
}
