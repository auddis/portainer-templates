export const formatBigNumber = (num: number): string => {
  if (!num) return '';
  const units = ['k', 'M', 'B'];
  let unitIndex = 0;
  let value = num;
  while (value >= 1000 && unitIndex < units.length) {
    value /= 1000;
    unitIndex++;
  }
  const decimals = num < 10000 || (num >= 100000 && num < 1000000) ? 0 : 1;
  return num < 1000 ? num.toString() : value.toFixed(decimals) + units[unitIndex - 1];
};

export const formatBytes = (bytes: number | null): string => {
  if (!bytes) return '';
  const mb = bytes / 1048576;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
};

export const formatDate = (dateTime: string): string => {
  if (!dateTime) return '';
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: '2-digit' }).format(date);
};

export const timeAgo = (dateTime: string): string => {
  if (!dateTime) return '';
  const time = new Date(dateTime).getTime();
  if (Number.isNaN(time)) return '';
  const elapsed = Date.now() - time;
  if (elapsed < 0) return 'just now';
  const msPer = [60000, 3600000, 86400000, 2592000000, 31536000000];
  const units = ['minute', 'hour', 'day', 'month', 'year'];

  for (let i = 0; i < msPer.length; i++) {
    if (elapsed < msPer[i]) {
      const value = Math.floor(elapsed / (i > 0 ? msPer[i - 1] : 1));
      return value === 0 ? 'just now' : `${value} ${units[i - 1] || 'minute'}${value > 1 ? 's' : ''} ago`;
    }
  }
  return `${Math.floor(elapsed / msPer[4])} years ago`;
};
