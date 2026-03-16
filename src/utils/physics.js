const R_EARTH = 6371;
const TO_RAD = Math.PI / 180;

export const haversine = (lat1, lon1, lat2, lon2) => {
  const dLat = (lat2 - lat1) * TO_RAD;
  const dLon = (lon2 - lon1) * TO_RAD;
  const lat1Rad = lat1 * TO_RAD;
  const lat2Rad = lat2 * TO_RAD;
  
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) *
            Math.sin(dLon / 2) ** 2;
  
  return R_EARTH * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const boundsFromPoints = (a, b, padding = 0.01) => ({
  south: Math.min(a.lat, b.lat) - padding,
  north: Math.max(a.lat, b.lat) + padding,
  west: Math.min(a.lng, b.lng) - padding,
  east: Math.max(a.lng, b.lng) + padding
});
