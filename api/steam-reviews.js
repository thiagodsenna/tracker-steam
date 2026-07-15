export default async function handler(req, res) {
  const { appid } = req.query;
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (!appid) return res.status(400).json({ error: 'AppID é obrigatório' });

  try {
    // Busca os reviews (por padrão vem os mais recentes/relevantes)
    const response = await fetch(`https://store.steampowered.com/appreviews/${appid}?json=1&language=brazilian&num_per_page=5`);
    const data = await response.json();
    
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Falha ao buscar reviews da Steam' });
  }
}
