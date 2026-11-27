import type { GrammarSuggestion } from '@/types';

export interface ParagraphSuggestions {
  startIndex: number;
  endIndex: number;
  edits: GrammarSuggestion[];
  hasConflicts: boolean;
}

export function suggestionsOverlap(a: GrammarSuggestion, b: GrammarSuggestion): boolean {
  if (a.startIndex === a.endIndex && b.startIndex === b.endIndex) {
    return a.startIndex === b.startIndex;
  }
  return a.startIndex < b.endIndex && b.startIndex < a.endIndex;
}

export function applyTextEdits(text: string, edits: GrammarSuggestion[], offset = 0): string {
  for (const { startIndex, endIndex, replacement } of [...edits].reverse()) {
    text = text.slice(0, startIndex - offset) + replacement + text.slice(endIndex - offset);
  }
  return text;
}

export function suggestionsByParagraph(text: string, suggestions: GrammarSuggestion[]): ParagraphSuggestions[] {
  const paragraphs: ParagraphSuggestions[] = [];
  const sorted = [...suggestions].sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex);

  // Only hard breaks delimit paragraphs. Visual wrapping leaves the field text unchanged.
  for (const { 0: line, index: startIndex } of text.matchAll(/[^\r\n]+/g)) {
    const endIndex = startIndex + line.trimEnd().length;
    if (endIndex <= startIndex) continue;

    const edits: GrammarSuggestion[] = [];
    let hasConflicts = false;
    for (const item of sorted) {
      if (item.startIndex < startIndex || item.endIndex > endIndex) continue;
      const previous = edits.at(-1);
      if (previous && suggestionsOverlap(previous, item)) hasConflicts = true;
      else edits.push(item);
    }

    if (edits.length) paragraphs.push({ startIndex, endIndex, edits, hasConflicts });
  }

  return paragraphs;
}

export function retainUnchangedSuggestions(
  suggestions: GrammarSuggestion[],
  previousText: string,
  text: string,
): GrammarSuggestion[] {
  if (previousText === text || !suggestions.length) return suggestions;

  let prefix = 0;
  while (prefix < previousText.length && previousText[prefix] === text[prefix]) prefix++;

  let previousEnd = previousText.length;
  let end = text.length;
  while (previousEnd > prefix && end > prefix && previousText[previousEnd - 1] === text[end - 1]) {
    previousEnd--;
    end--;
  }

  // Rich-text editors may change spaces in several places when applying an edit.
  // If the visible characters match, their order gives us an unambiguous offset map.
  const positions: number[] = [];
  if (previousText.replace(/\s/g, '') === text.replace(/\s/g, '')) {
    let target = 0;
    for (const { index } of previousText.matchAll(/\S/g)) {
      while (/\s/.test(text[target] ?? '')) target++;
      positions[index] = target++;
    }
  }

  const word = /[\p{L}\p{M}\p{N}]/u;
  function joinsWord(at: number, newAt: number) {
    return !word.test(previousText[at] ?? '') && word.test(text[newAt] ?? '');
  }

  return suggestions.flatMap((item) => {
    const insertion = item.startIndex === item.endIndex;
    let startIndex: number;
    let endIndex: number;
    if (insertion && item.startIndex >= prefix && item.startIndex <= previousEnd) {
      const before = positions[item.startIndex - 1];
      const after = positions[item.startIndex];
      if (before === undefined && after === undefined) return [];
      if (before !== undefined && after !== undefined && before + 1 !== after) return [];
      startIndex = endIndex = after ?? before + 1;
    } else if (item.endIndex <= prefix) {
      ({ startIndex, endIndex } = item);
    } else if (item.startIndex >= previousEnd) {
      const offset = end - previousEnd;
      startIndex = item.startIndex + offset;
      endIndex = item.endIndex + offset;
    } else {
      startIndex = positions[item.startIndex];
      endIndex = positions[item.endIndex - 1] + 1;
    }

    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex) ||
        text.slice(startIndex, endIndex) !== item.original) return [];

    if ((word.test(item.original[0] ?? '') && joinsWord(item.startIndex - 1, startIndex - 1)) ||
        (word.test(item.original.at(-1) ?? '') && joinsWord(item.endIndex, endIndex))) return [];

    return [{ ...item, startIndex, endIndex }];
  });
}
