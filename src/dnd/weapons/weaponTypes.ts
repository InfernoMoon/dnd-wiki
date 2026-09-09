import type { CachedRender } from '../../cache/renderCache';

export interface WeaponTableRow {
	headers: string[];
	values: string[];
}

export interface WeaponIndexEntry {
	name: string;
	type: string;
	weaponType?: string;
	table?: WeaponTableRow;
	render?: CachedRender;
}

export interface WeaponIndex {
	items: WeaponIndexEntry[];
}
