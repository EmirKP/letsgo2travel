// Scale declared text sizes without enlarging illustrations or touch targets.
// em/% sizes already inherit their parent's scaling and must not compound it.
export function scalableFontSize(value) {
  if (value.includes('--app-text-scale') || !/\d(?:px|rem|vw|vh|cqw)\b/.test(value) || /\d(?:em\b|%)/.test(value)) return value;
  return `calc((${value}) * var(--app-text-scale, 1))`;
}

// Read top-level shorthand tokens so function spaces and quoted font-family
// names cannot be mistaken for a second size. Stop at the first size, including
// inherited em/% or keyword sizes that must remain unchanged.
function scalableFontShorthand(value) {
  if (value.includes('--app-text-scale')) return value;
  for (let start = 0; start < value.length;) {
    if (/\s/.test(value[start])) { start++; continue; }
    if (/['"/]/.test(value[start])) return value;
    let end = start, depth = 0, quote = '';
    for (; end < value.length; end++) {
      const character = value[end];
      if (character === '\\') { end++; continue; }
      if (quote) { if (character === quote) quote = ''; continue; }
      if (character === '"' || character === "'") { quote = character; continue; }
      if (character === '(') depth++;
      else if (character === ')') depth--;
      else if (!depth && /[\s/]/.test(character)) break;
    }
    if (depth || quote) return value;
    const token = value.slice(start, end);
    const isSize = /^\d*\.?\d+(?:[a-z]+|%)$/i.test(token)
      || /^(?:xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger|math)$/i.test(token)
      || /^(?:calc|clamp|min|max|var)\(/i.test(token);
    // Oblique can carry an angle before the font size.
    if (isSize && !/(?:deg|grad|rad|turn)$/i.test(token)) {
      return value.slice(0, start) + scalableFontSize(token) + value.slice(end);
    }
    start = end;
  }
  return value;
}

export function mobileTextScaling() {
  return {
    postcssPlugin: 'letsgo2travel-text-scaling',
    OnceExit(root) {
      // Keep vendor map labels and their geometry under the map's own control.
      if (!root.source?.input.file?.replaceAll('\\', '/').includes('/mobile/src/')) return;
      root.walkDecls(decl => {
        if (decl.prop === 'font-size') decl.value = scalableFontSize(decl.value);
        else if (decl.prop === 'font') decl.value = scalableFontShorthand(decl.value);
      });
    },
  };
}
