import type { App } from 'obsidian';
import { getKnownWeaponIdsForKey } from '../dnd/weapons/weaponService';
import { DndNameSuggest } from './baseSuggest';

/** Suggest preloaded weapon names inside dnd-weapon blocks. */
export class WeaponNameSuggest extends DndNameSuggest {
	constructor(appPlugin: { app: App }) {
		super(appPlugin, {
			blockPattern: /^(?:```\s*dnd([a-z0-9]*)-weapon\s*)$/i,
			getIds: getKnownWeaponIdsForKey,
		});
	}
}
