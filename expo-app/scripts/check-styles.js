#!/usr/bin/env node
/**
 * Fails on styling that the design system forbids because it silently misbehaves (UI-2).
 *
 * Every rule here was checked against the installed react-native-css-interop on 2026-10-09, by
 * compiling the class and reading what a phone receives — two older rules turned out to be false
 * when tested, so a rule earns a place here only once it has been. okf/design_system.md has the why.
 *
 * Class names:
 * - `space-x-*` / `space-y-*` compile to a sibling selector the interop drops: they work on web and
 *   do nothing on iOS and Android. Use `gap-*`; on a ScrollView, in `contentContainerClassName`.
 * - `transition-*` / `animate-*` wrap the component in Reanimated, which this app does not animate
 *   with (okf/architecture.md rule 2). Animate with `<AnimatedBox>`.
 * - `truncate` only clips on a phone — no ellipsis, no single line. Use `numberOfLines={1}`.
 * - `sticky` does nothing on a phone.
 * - `shadow-xs` is not in the theme, so it does nothing anywhere.
 *
 * Elements:
 * - `<Animated.*>` anywhere but AnimatedBox.tsx: a className on it is silently dropped (UI-7).
 * - `hover:` / `active:` / `focus:` on a plain `<View>`: the interop turns it into a Pressable, and
 *   remounts it if the class arrives after the first render. Fine on a pressable.
 * - Web drag props (`onDragOver`, `onDrop`, `onDragStart`, `draggable`) on anything but a `<div>`
 *   rendered behind `Platform.OS === 'web'`.
 *
 * Run: `npm run check:styles` (from expo-app/). Exit code 1 lists each offending line.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN = ['app', 'components'];

// Bounded by quote, brace, space or line edge, so a word inside running text is not a class.
const cls = (body) => new RegExp(`(?<=^|[\\s"'\`{])${body}(?=[\\s"'\`}]|$)`, 'g');
const CLASS_RULES = [
  { re: cls('space-[xy]-[\\w.[\\]-]+'), what: 'space-* does nothing on a phone; use gap-*' },
  { re: cls('(?:transition|animate)(?:-[\\w-]+)?'), what: 'NativeWind animation; use <AnimatedBox>' },
  { re: cls('truncate'), what: 'truncate only clips on a phone; use numberOfLines={1}' },
  { re: cls('sticky'), what: 'sticky does nothing on a phone' },
  { re: cls('shadow-xs'), what: 'shadow-xs is not in the theme; use shadow-sm' },
];
const DRAG_PROPS = /\b(onDragOver|onDrop|onDragStart|draggable)\s*=/;
const PSEUDO = /(?<=^|[\s"'`{])(?:hover|active|focus):/;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** The text of a JSX opening tag starting at `start` (the `<`), skipping strings and `{…}`. */
function openingTag(text, start) {
  // A stack of what we are inside: '{' for an expression, or a quote character for a string. A
  // template literal's `${` pushes '{' on top of its '`', so the closing `}` returns to the string.
  const stack = [];
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    const top = stack[stack.length - 1];
    if (top === '"' || top === "'" || top === '`') {
      if (ch === '\\') i++;
      else if (ch === top) stack.pop();
      else if (top === '`' && ch === '$' && text[i + 1] === '{') { stack.push('{'); i++; }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') stack.push(ch);
    else if (ch === '{') stack.push('{');
    else if (ch === '}') stack.pop();
    else if (ch === '>' && stack.length === 0) return text.slice(start, i + 1);
  }
  return text.slice(start);
}

const offences = [];
for (const top of SCAN) {
  const dir = path.join(ROOT, top);
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir, [])) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');
    const lineOf = (index) => text.slice(0, index).split('\n').length;

    text.split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comments describe classes; they do not use them
      for (const { re, what } of CLASS_RULES) {
        re.lastIndex = 0;
        let match;
        while ((match = re.exec(line))) offences.push(`${rel}:${i + 1}  ${match[0]} — ${what}`);
      }
    });

    for (const match of text.matchAll(/<([A-Za-z][\w.]*)/g)) {
      const tagName = match[1];
      const tag = openingTag(text, match.index);
      const at = `${rel}:${lineOf(match.index)}`;
      if (tagName.startsWith('Animated.') && rel !== 'components/AnimatedBox.tsx') {
        offences.push(`${at}  <${tagName}> — use <AnimatedBox>; a className on it is dropped`);
      }
      if (tagName === 'View' && PSEUDO.test(tag)) {
        offences.push(`${at}  pseudo-class on <View> — make it a Pressable`);
      }
      if (tagName !== 'div' && /^[A-Z]/.test(tagName) && DRAG_PROPS.test(tag) && !/Map|Marker/.test(tagName)) {
        offences.push(`${at}  web drag prop on <${tagName}> — only on a web-guarded <div>`);
      }
    }
  }
}

if (offences.length) {
  console.error(`Styling the design system forbids (okf/design_system.md). Found ${offences.length}:`);
  for (const offence of offences) console.error(`  ${offence}`);
  process.exit(1);
}
console.log('check:styles — no styling that silently misbehaves on a phone.');
