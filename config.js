// config.js (P1) — shared settings. Supabase publishable key is safe in the browser (RLS limits what it can do).
window.JCONFIG = {
  supabaseUrl: 'https://mbwjeoqpppwltixmxely.supabase.co',
  supabaseKey: 'sb_publishable_Vv2JQGIosvek9lXQqKSlDA_KcdWBwHi',
  // On localhost the Vercel functions aren't running, so call the deployed ones (they send CORS *).
  apiBase: /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'https://made-of-her-83ve.vercel.app' : ''
};

// Tiny Supabase REST helper (optional; plain fetch works too). Every call resolves to data or null — never throws.
//   JDB.select('members', 'is_sample=eq.true&order=years.desc')
//   JDB.upsert('members', {id, name, ...})
//   JDB.insert('connections', {from_id, to_id, note})
//   JDB.update('connections', 'id=eq.' + id, {status:'accepted'})
window.JDB = (function () {
  function ok() { return !!(JCONFIG.supabaseUrl && JCONFIG.supabaseKey); }
  function req(method, path, body, prefer) {
    if (!ok()) return Promise.resolve(null);
    var h = { apikey: JCONFIG.supabaseKey, Authorization: 'Bearer ' + JCONFIG.supabaseKey, 'Content-Type': 'application/json' };
    if (prefer) h.Prefer = prefer;
    return fetch(JCONFIG.supabaseUrl + '/rest/v1/' + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.status === 204 ? [] : r.json(); })
      .catch(function (e) { console.warn('JDB', method, path, e); return null; });
  }
  return {
    ready: ok,
    select: function (table, query) { return req('GET', table + '?' + (query || 'select=*')); },
    upsert: function (table, row) { return req('POST', table, row, 'resolution=merge-duplicates,return=representation'); },
    insert: function (table, row) { return req('POST', table, row, 'return=representation'); },
    update: function (table, query, patch) { return req('PATCH', table + '?' + query, patch, 'return=representation'); }
  };
})();
