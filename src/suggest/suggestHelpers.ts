import type { Editor, EditorPosition } from 'obsidian';

export interface TextSuggestion {
	text: string;
}

/** Find the nearest D&D code block above the cursor and return its match. */
export function findDndCodeBlock(
	cursor: EditorPosition,
	editor: Editor,
	blockPattern: RegExp,
): RegExpMatchArray | null {
	for (let lineNumber = cursor.line; lineNumber >= Math.max(0, cursor.line - 50); lineNumber--) {
		const line = editor.getLine(lineNumber).trim();
		if (line.startsWith('```')) {
			blockPattern.lastIndex = 0;
			return line.match(blockPattern);
		}
	}
	return null;
}

/** Return the start of the current comma-separated value, skipping whitespace. */
export function getCommaSeparatedStart(line: string, cursor: EditorPosition, fallbackStart = 0): number {
	const uptoCursor = line.slice(0, cursor.ch);
	const commaIndex = uptoCursor.lastIndexOf(',');
	let startCh = commaIndex >= 0 ? commaIndex + 1 : fallbackStart;
	while (startCh < uptoCursor.length && /\s/.test(uptoCursor[startCh])) startCh++;
	return startCh;
}

/** Convert strings into case-insensitive filtered text suggestions. */
export function getTextSuggestions(
	values: readonly string[],
	query: string,
	matchMode: 'includes' | 'startsWith' = 'includes',
	limit = 50,
): TextSuggestion[] {
	const normalizedQuery = query.toLowerCase();
	return values
		.filter((value) => {
			const normalizedValue = value.toLowerCase();
			return matchMode === 'startsWith'
				? normalizedValue.startsWith(normalizedQuery)
				: normalizedValue.includes(normalizedQuery);
		})
		.slice(0, limit)
		.map((text) => ({ text }));
}
