// relevance.js — makes the mosaic relevant to the viewer: their SCENE (classroom, lab, stage…) and their LOCATION.
// Turns a scene + location into a per-tile ΔE bonus and hands it to the engine (Mosaic.setBoost).
// Reads optional tile fields from library/tiles.json: themes[], lat, lon, place, country. Owner: P2 (Emma).
// Privacy: location is read in the browser and compared locally; coordinates are never sent anywhere.
(function () {
  'use strict';
  // id -> label, primary theme tag, related topic tags. A scene boosts tiles whose `themes` contain its tag.
  const SCENES = [
    { id: 'classroom', label: 'Classroom', tag: 'classroom', related: ['education'] },
    { id: 'lab',       label: 'Lab',       tag: 'lab',       related: ['science'] },
    { id: 'stage',     label: 'Stage',     tag: 'stage',     related: ['arts'] },
    { id: 'courtroom', label: 'Courtroom', tag: 'courtroom', related: ['justice'] },
    { id: 'newsroom',  label: 'Newsroom',  tag: 'newsroom',  related: ['media'] },
    { id: 'clinic',    label: 'Clinic',    tag: 'clinic',    related: ['health'] },
    { id: 'field',     label: 'Sports field', tag: 'field',  related: ['sports'] },
    { id: 'studio',    label: 'Studio',    tag: 'studio',    related: ['arts', 'design'] },
    { id: 'office',    label: 'Office',    tag: 'office',    related: ['business', 'leadership'] },
    { id: 'library',   label: 'Library',   tag: 'library',   related: ['education', 'arts'] }
  ];
  const SCENE_BONUS = 18, RELATED_BONUS = 6, MAX_BONUS = 26, NEAREST_N = 40, NEAREST_BONUS = 12;
  let scene = null, loc = null;

  function km(lat1, lon1, lat2, lon2) {
    const R = 6371, rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function distanceKm(tile) {
    return loc && tile && tile.lat != null ? Math.round(km(loc.lat, loc.lon, tile.lat, tile.lon)) : null;
  }
  const localBonus = d => (d == null ? 0 : d < 150 ? 20 : d < 800 ? 14 : d < 2500 ? 8 : 0);

  function apply() {
    if (!window.Mosaic || !Mosaic.setBoost) return;
    const tiles = Mosaic.getTiles(), s = SCENES.find(x => x.id === scene);
    if (!s && !loc) { Mosaic.setBoost(null); return; }
    const arr = new Float32Array(tiles.length);
    // Where few women are from nearby (e.g. Lagos), still favor the NEAREST_N closest ones so "near me" always shows something.
    let nearest = new Set();
    if (loc) {
      const ds = [];
      tiles.forEach((t, i) => { const d = distanceKm(t); if (d != null) ds.push([d, i]); });
      ds.sort((a, b) => a[0] - b[0]);
      nearest = new Set(ds.slice(0, NEAREST_N).map(x => x[1]));
    }
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i], th = t.themes || []; let b = 0;
      if (s) { if (th.includes(s.tag)) b += SCENE_BONUS; else if (s.related.some(r => th.includes(r))) b += RELATED_BONUS; }
      if (loc && t.kind === 'person') b += Math.max(localBonus(distanceKm(t)), nearest.has(i) ? NEAREST_BONUS : 0);
      arr[i] = Math.min(b, MAX_BONUS);
    }
    Mosaic.setBoost(arr);
  }

  window.Relevance = {
    scenes: SCENES,
    setScene(id) { scene = id || null; apply(); },
    getScene() { return scene; },
    setLocation(l) { loc = l ? { lat: l.lat, lon: l.lon } : null; apply(); },
    hasLocation() { return !!loc; },
    distanceKm,
    // how many tiles currently get a boost (for the UI hint)
    count() {
      const tiles = Mosaic.getTiles(), s = SCENES.find(x => x.id === scene);
      let n = 0;
      for (const t of tiles) {
        const th = t.themes || [];
        if ((s && th.includes(s.tag)) || (loc && t.kind === 'person' && localBonus(distanceKm(t)) > 0)) n++;
      }
      return n;
    },
    // Ask the browser for the viewer's position (needs HTTPS or localhost + user permission).
    locate() {
      return new Promise((res, rej) => {
        if (!navigator.geolocation) return rej(new Error('unsupported'));
        navigator.geolocation.getCurrentPosition(
          p => { this.setLocation({ lat: p.coords.latitude, lon: p.coords.longitude }); res(loc); },
          e => rej(e), { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
      });
    },
    apply
  };
})();
