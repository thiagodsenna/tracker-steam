export default async function handler(req, res) {
  const { ids } = req.query; // Espera: ids="123,456,789"
  if (!ids) return res.status(400).json({ error: 'IDs são obrigatórios' });

  try {
    // A Steam aceita até ~100 IDs por vez nesta URL
    const url = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(ids)}`;
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    });
    const data = await response.json();
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Falha na busca em lote' });
  }
}
