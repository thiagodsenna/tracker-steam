// Arquivo: /api/hltb.js (Opcional, só se precisar evitar CORS)
export default async function handler(req, res) {
  const { appid } = req.query;
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!appid) return res.status(400).json({ error: 'AppID obrigatório' });

  try {
    const response = await fetch(`https://hltbapi.codepotatoes.de/steam/${appid}`);
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Falha ao buscar HLTB' });
  }
}