import type { RoomDef, RoomId } from '../types';
import { deck } from './deck';
import { bridge } from './bridge';
import { corridor } from './corridor';
import { cabin } from './cabin';
import { radio } from './radio';
import { engine } from './engine';
import { hold } from './hold';
import { fcsle } from './fcsle';
import { testroom } from './testroom';
import { tank2 } from './tank2';
import { station } from './station';
import { opsroom } from './opsroom';
import { battery } from './battery';
import { beach } from './beach';

export const ROOMS: Record<RoomId, RoomDef> = { deck, bridge, corridor, cabin, radio, engine, hold, fcsle, testroom, tank2, station, opsroom, battery, beach };
