import type { CatData } from '@/hooks/useCatData';

export interface CatOption {
  id: string;
  label: string;
  desc: string;
  insert: string;
  color: string; // hex color (for inline style)
  avatar: string;
}

/** Build @mention autocomplete options from dynamic cat data.
 *  Filters out cats with no mentionPatterns (not routable via @mention). */
/** Format display label with optional variant disambiguation */
function formatCatLabel(cat: CatData): string {
  return cat.variantLabel ? `@${cat.displayName} (${cat.variantLabel})` : `@${cat.displayName}`;
}

export function buildCatOptions(cats: CatData[]): CatOption[] {
  return cats
    .filter((cat) => cat.mentionPatterns.length > 0)
    .map((cat) => ({
      id: cat.id,
      label: formatCatLabel(cat),
      desc: cat.roleDescription,
      insert: `@${cat.mentionPatterns[0].replace(/^@/, '')} `,
      color: cat.color.primary,
      avatar: cat.avatar,
    }));
}

/** Build whisper target options from dynamic cat data.
 *  Includes ALL cats — whisper routing accepts any catId regardless of mentionPatterns. */
export function buildWhisperOptions(cats: CatData[]): CatOption[] {
  return cats.map((cat) => ({
    id: cat.id,
    label: formatCatLabel(cat),
    desc: cat.roleDescription,
    insert: cat.mentionPatterns.length > 0 ? `@${cat.mentionPatterns[0].replace(/^@/, '')} ` : '',
    color: cat.color.primary,
    avatar: cat.avatar,
  }));
}

/** Pure detection — returns menu trigger type from current input, or null. */
export function detectMenuTrigger(
  val: string,
  selectionStart: number,
): { type: 'mention'; start: number; filter: string } | null {
  const textBefore = val.slice(0, selectionStart);
  const atIdx = textBefore.lastIndexOf('@');
  if (atIdx >= 0) {
    const fragment = textBefore.slice(atIdx + 1);
    const charBefore = atIdx > 0 ? val[atIdx - 1] : ' ';
    if (/\s/.test(charBefore!) && fragment.length <= 12 && !/\s/.test(fragment)) {
      return { type: 'mention', start: atIdx, filter: fragment };
    }
  }
  return null;
}
