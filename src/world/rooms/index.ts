import type { RoomDef, RoomId } from '../types';
import { deck } from './deck';
import { bridge } from './bridge';
import { corridor } from './corridor';
import { cabin } from './cabin';
import { radio } from './radio';
import { engine } from './engine';
import { hold } from './hold';

export const ROOMS: Record<RoomId, RoomDef> = { deck, bridge, corridor, cabin, radio, engine, hold };
