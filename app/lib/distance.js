// ➤ Kilometres between two points on the globe, by the haversine formula (a sphere of 6,371 km:
// ➤ within half a percent of the real distance, plenty for "25 km around a town").
const rad = d => (d * Math.PI) / 180;

export function distanceKm([lat1, lon1], [lat2, lon2]) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}
