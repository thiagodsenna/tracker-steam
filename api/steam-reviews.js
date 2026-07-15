export default async function handler(req, res) {
  const { appid } = req.query;
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (!appid) return res.status(400).json({ error: 'AppID é obrigatório' });

  try {
    // Busca os reviews utilizando os parâmetros para retornar todos desde o início (day_range=all),
    // em todos os idiomas (language=all) e ordenados pelos mais úteis (filter=all)
    const response = await fetch(`https://store.steampowered.com/appreviews/${appid}?json=1&filter=all&language=all&day_range=all&num_per_page=20`);
    const data = await response.json();
    
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Falha ao buscar reviews da Steam' });
  }
}
