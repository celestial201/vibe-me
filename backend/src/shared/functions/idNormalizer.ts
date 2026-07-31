import { ObjectId } from 'mongodb';

/**
 * Coerces any ID format (ObjectId, string, { _id }, { $oid }, etc.) into a clean string representation.
 */
export function normalizeId(val: any): string {
  if (val === null || val === undefined) return '';

  if (typeof val === 'string') {
    if (val === '[object Object]') return '';
    return val.trim();
  }

  if (val instanceof ObjectId) {
    return val.toString();
  }

  if (typeof val === 'object') {
    if (typeof val.$oid === 'string') return val.$oid.trim();
    if (val._id) return normalizeId(val._id);
    if (val.id) return normalizeId(val.id);
    if (val.courseId) return normalizeId(val.courseId);
    if (val.course_id) return normalizeId(val.course_id);
    if (typeof val.toString === 'function') {
      const str = val.toString();
      if (str && str !== '[object Object]') return str.trim();
    }
  }

  return String(val).trim();
}

/**
 * Safely converts an ID string or object into a valid MongoDB ObjectId.
 * Returns null if the value cannot be coerced into a valid 24-character hex string.
 */
export function safeObjectId(id: any): ObjectId | null {
  if (!id) return null;

  if (id instanceof ObjectId) {
    return id;
  }

  const str = normalizeId(id);
  if (str && /^[0-9a-fA-F]{24}$/.test(str)) {
    try {
      return new ObjectId(str);
    } catch {
      return null;
    }
  }

  return null;
}
