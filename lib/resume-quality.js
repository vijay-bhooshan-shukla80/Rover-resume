// Content cleanup for Upload / Convert only. No template or layout mutations.
const key = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}+#%]+/gu, ' ').trim().replace(/\s+/g, ' ');
export const uniqueContent = values => [...new Map(values.filter(Boolean).map(value => [key(value), value])).values()];
export function cleanProfessionalProse(value) {
  return String(value || '').replace(/^\s*(?:dedicated|highly motivated|results[- ]driven|dynamic)\s+/i, '').replace(/\bproven expertise\b/gi, 'experience').replace(/\bexceptional levels of\s+/gi, '').replace(/\bmeticulously\s+/gi, '').replace(/\bleveraging\b/gi, 'using').replace(/\s+/g, ' ').trim().replace(/^\w/, c => c.toUpperCase());
}
const actions = new Set('deliver delivered resolve resolved achieve achieved serve served produce produced complete completed strengthen strengthened manage managed coordinate coordinated support supported develop developed improve improved maintain maintained collaborate collaborated build built create created test tested document documented assist assisted'.split(' '));
export function cleanBullet(value) {
  let text = cleanProfessionalProse(String(value || '').replace(/^[\s•▪*-]+/, ''));
  for (let attempt = 0; attempt < 5; attempt++) {
    const broken = text.match(/^(delivered|managed|supported|improved)\s+(\w+)\b/i);
    if (!broken || !actions.has(broken[2].toLowerCase())) break;
    text = text.slice(broken[1].length).trim();
  }
  text = text.replace(/\b(\w+)\s+\1\b/gi, '$1').replace(/\bcustomer\s+enquires\b/gi, 'customer enquiries');
  text = text.replace(/\bimplementing interactive (?:gameplay )?features such as\b/gi, 'with')
    .replace(/\bmaintain a clear approach to managing\b/gi, 'manage')
    .replace(/\bthrough an intuitive interface\b/gi, 'through the interface')
    .replace(/\bto support user engagement and seamless online interaction\b/gi, 'to support online interaction');
  if (text) text = text[0].toUpperCase() + text.slice(1);
  return text && !/[.!?]$/.test(text) ? `${text}.` : text;
}
