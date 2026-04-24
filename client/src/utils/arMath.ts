export const getRelativeARCoords = (
  userLat: number,
  userLon: number,
  userAlt: number,
  initialHeading: number,
  anchorLat: number,
  anchorLon: number,
  anchorAlt: number | null
) => {
  const R = 6371000;
  const dLat = (anchorLat - userLat) * (Math.PI / 180);
  const dLon = (anchorLon - userLon) * (Math.PI / 180);

  const x_east = R * dLon * Math.cos(userLat * (Math.PI / 180));
  const z_north = R * dLat;
  const y_diff = anchorAlt !== null ? anchorAlt - userAlt : 0;

  const H_rad = initialHeading * (Math.PI / 180);
  const cosH = Math.cos(H_rad);
  const sinH = Math.sin(H_rad);

  const viroX = x_east * cosH - z_north * sinH;
  const viroZ = -(x_east * sinH + z_north * cosH);

  return { x: viroX, y: y_diff, z: viroZ };
};
