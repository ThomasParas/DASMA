export type XmlAttrs = Record<string, string>;
export type XmlEvent =
  | { type: 'open'; name: string; attrs: XmlAttrs; selfClosing: boolean }
  | { type: 'close'; name: string }
  | { type: 'text'; text: string };

// Groups: 1 CDATA body; 2 "/" of a closing tag; 3 tag name; 4 attributes; 5 "/" of a self-closing tag; 6 text.
const TOKEN =
  /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
const ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
    if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith('#')) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return NAMED[e];
  });
}

/** Streams the tags and text of a well-formed XML document. Declarations and comments are skipped. */
export function* xmlEvents(xml: string): Generator<XmlEvent> {
  for (const m of xml.matchAll(TOKEN)) {
    if (m[1] !== undefined) {
      yield { type: 'text', text: m[1] };
    } else if (m[3] !== undefined) {
      if (m[2] === '/') {
        yield { type: 'close', name: m[3] };
        continue;
      }
      const attrs: XmlAttrs = {};
      for (const a of (m[4] ?? '').matchAll(ATTR)) attrs[a[1]] = decodeEntities(a[2] ?? a[3] ?? '');
      yield { type: 'open', name: m[3], attrs, selfClosing: m[5] === '/' };
    } else if (m[6] !== undefined) {
      yield { type: 'text', text: decodeEntities(m[6]) };
    }
  }
}
