import { FLAG_BELOW, type ImportResult } from '@dasma/script';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A local, self-contained HTML view of one import, for eyeballing real scripts (spec §6.6). */
export function renderDumpHtml(result: ImportResult, fileName: string): string {
  const { script, profile, warnings, pages } = result;
  const names = new Map(script.characters.map((c) => [c.id, c.name]));
  const flagged = script.units.filter((u) => u.tagConfidence < FLAG_BELOW).length;
  const tokens = [...profile.cueTokens]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([t, n]) => `${esc(t)} (${n})`)
    .join(', ');
  const rows = script.units
    .map((u) => {
      const cls = `${u.tagConfidence < FLAG_BELOW ? 'flagged' : ''} ${u.kind}`;
      const who = u.characterId ? (names.get(u.characterId) ?? u.characterId) : '';
      return `<tr class="${cls}"><td>${esc(u.id)}</td><td>${u.kind}</td><td>${esc(who)}</td><td>${u.tagConfidence.toFixed(2)}</td><td>${esc(u.text).replace(/\n/g, '<br>')}</td></tr>`;
    })
    .join('\n');
  const warningList = warnings.length ? `<ul>${warnings.map((w) => `<li>${esc(JSON.stringify(w))}</li>`).join('')}</ul>` : '<p>No warnings.</p>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fileName)} — DASMA import</title>
<style>
body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#111;background:#fff}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:4px 8px;text-align:left;vertical-align:top}
tr.flagged{background:#fff3cd}tr.characterName td:nth-child(5),tr.heading td:nth-child(5){font-weight:600}
tr.direction td:nth-child(5){font-style:italic;color:#555}.meta{color:#555}
</style></head><body>
<h1>${esc(script.title)}</h1>
<p class="meta">${esc(fileName)} · ${pages} pages · ${script.units.length} units · ${flagged} flagged (confidence below ${FLAG_BELOW}) · ${script.characters.length} characters</p>
<p class="meta">Speakers: ${profile.primary ?? 'none found'}${profile.secondary ? ` + ${profile.secondary}` : ''} · cue tokens: ${tokens || 'none'}</p>
${warningList}
<table><thead><tr><th>Id</th><th>Kind</th><th>Speaker</th><th>Conf.</th><th>Text</th></tr></thead><tbody>
${rows}
</tbody></table>
</body></html>
`;
}
