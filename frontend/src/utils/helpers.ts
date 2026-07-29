export const normalizeIdString = (item: any): string | undefined => {
  if (!item) return undefined;
  if (typeof item === 'string') {
    return item === '[object Object]' ? undefined : item;
  }
  if (typeof item === 'object') {
    // 1. Check for populated document/object with id properties
    const candidateId = item._id || item.id || item.versionId || item.courseVersionId;
    if (candidateId) {
      const resolved = normalizeIdString(candidateId);
      if (resolved) return resolved;
    }
    // 2. Check for BSON Buffer structure
    if (item.buffer && Array.isArray(item.buffer.data)) {
      try {
        return Array.from(new Uint8Array(item.buffer.data))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      } catch (_) {
        return undefined;
      }
    }
    // 3. Check direct toString if overridden
    if (typeof item.toString === 'function') {
      const str = item.toString();
      if (str && str !== '[object Object]') return str;
    }
  }
  return undefined;
};

export const bufferToHex = (item: any): string => {
  return normalizeIdString(item) || '';
};

// Helper function to get time-based greeting
export const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};
