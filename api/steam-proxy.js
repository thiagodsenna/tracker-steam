export default async function handler(req, res) {
  const { appid } = req.query;
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!appid) return res.status(400).json({ error: 'AppID é obrigatório' });
  try {
    const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}`);
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Falha ao conectar com Steam' });
  }
}