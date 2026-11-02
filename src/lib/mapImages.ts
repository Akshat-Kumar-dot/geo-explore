/** Canvas-generated sprites, so the map has no external sprite/glyph dependency. */

export function hatchImage(size = 12, color = 'rgba(255, 226, 168, 0.62)'): ImageData {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, size, size);
  g.strokeStyle = color;
  g.lineWidth = 1.6;
  for (let i = -size; i < size * 2; i += 5) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + size, size);
    g.stroke();
  }
  return g.getImageData(0, 0, size, size);
}
