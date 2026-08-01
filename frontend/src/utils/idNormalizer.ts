/**
 * Robust utility function to extract clean string ID
 * unwrapping MongoDB Objects ({ $oid: "..." }, { _id: "..." }), courseId, or raw strings.
 */
export function extractStringId(id: any): string {
  if (!id) return '';
  if (typeof id === 'string') {
    const trimmed = id.trim();
    if (trimmed === '[object Object]') return '';
    return trimmed;
  }
  if (typeof id === 'object') {
    const clean =
      id._id ||
      id.$oid ||
      id.courseId ||
      id.id ||
      (typeof id.toString === 'function' ? id.toString() : '');
    return extractStringId(clean);
  }
  return String(id || '').trim();
}
