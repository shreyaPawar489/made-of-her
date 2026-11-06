// Dev-only fake library: colored "face" tiles so the engine/UI work without real data. Use ?fake=1
window.Mosaic && (window.Mosaic.useFakeLibrary = function (n = 400) {
  const TS = 64, PER = 48, c = document.createElement('canvas');
  c.width = c.height = TS * PER;
  const x = c.getContext('2d'), tiles = [];
  for (let i = 0; i < n; i++) {
    const r = (Math.random() * 256) | 0, g = (Math.random() * 256) | 0, b = (Math.random() * 256) | 0;
    const X = (i % PER) * TS, Y = ((i / PER) | 0) * TS;
    x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(X, Y, TS, TS);
    x.fillStyle = `rgba(0,0,0,0.25)`; x.beginPath(); x.arc(X + 32, Y + 26, 13, 0, 7); x.fill();
    x.fillRect(X + 14, Y + 44, 36, 20);
    x.fillStyle = '#fff'; x.font = 'bold 10px sans-serif'; x.fillText(String(i), X + 3, Y + 11);
    const d = x.getImageData(X, Y, TS, TS).data; let R = 0, G = 0, B = 0;
    for (let k = 0; k < d.length; k += 4) { R += d[k]; G += d[k + 1]; B += d[k + 2]; }
    const m = d.length / 4;
    tiles.push({ id: i, kind: 'person', era: 'history', name: 'Test Woman ' + i, year: 1900 + (i % 120), title: '',
      desc: 'Placeholder tile for development.', field: 'Test', link: '#', image: '', source: 'fake',
      rgb: [R / m | 0, G / m | 0, B / m | 0] });
  }
  window.Mosaic.setLibrary(c, tiles, { tileSize: TS, perRow: PER });
  return { count: n };
});
