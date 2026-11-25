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
