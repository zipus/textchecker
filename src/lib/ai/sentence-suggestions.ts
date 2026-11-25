import type { GrammarSuggestion } from '@/types';

const sentenceSegmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });

export interface SentenceSuggestions {
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

export function suggestionsBySentence(text: string, suggestions: GrammarSuggestion[]): SentenceSuggestions[] {
  const sentences: SentenceSuggestions[] = [];
  const assigned = new Set<string>();
  const sorted = [...suggestions].sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex);

  for (const line of text.matchAll(/[^\r\n]+/g)) {
    for (const { segment, index } of sentenceSegmenter.segment(line[0])) {
      const leadingSpace = segment.length - segment.trimStart().length;
      const startIndex = line.index + index + leadingSpace;
      const endIndex = line.index + index + segment.trimEnd().length;
      if (endIndex <= startIndex) continue;

      const edits: GrammarSuggestion[] = [];
      let hasConflicts = false;
      for (const item of sorted) {
        if (assigned.has(item.id) || item.startIndex < startIndex || item.endIndex > endIndex) continue;
        assigned.add(item.id);
        const previous = edits.at(-1);
        if (previous && suggestionsOverlap(previous, item)) hasConflicts = true;
        else edits.push(item);
      }

      if (edits.length) sentences.push({ startIndex, endIndex, edits, hasConflicts });
    }
  }

  return sentences;
}
