// /api/scene — Vercel serverless function. Guesses the viewer's setting from ONE small camera snapshot.
// Needs ANTHROPIC_API_KEY set in the Vercel project's environment variables. Without it, returns 501 and the UI
// falls back to the manual scene chips. The image is sent to Anthropic for this one request and is not stored here.
const SCENES = ['classroom', 'lab', 'stage', 'courtroom', 'newsroom', 'clinic', 'field', 'studio', 'office', 'library'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(501).json({ error: 'not configured' });
  const image = req.body && req.body.image;
  if (typeof image !== 'string' || image.length < 100 || image.length > 600000) return res.status(400).json({ error: 'bad image' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-5-5', max_tokens: 10,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: 'What kind of place is the background of this photo? Answer with exactly one word from: ' + SCENES.join(', ') + ', none.' }
        ] }]
      })
    });
    if (!r.ok) return res.status(502).json({ error: 'upstream ' + r.status });
    const j = await r.json();
    const word = ((j.content && j.content[0] && j.content[0].text) || '').toLowerCase().replace(/[^a-z]/g, '');
    res.status(200).json({ scene: SCENES.includes(word) ? word : null });
  } catch (e) {
    res.status(502).json({ error: 'failed' });
  }
};
