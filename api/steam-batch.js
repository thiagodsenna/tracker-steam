export default async function handler(req, res) {
  const { ids } = req.query; // Espera: ids="123,456,789"
  if (!ids) return res.status(400).json({ error: 'IDs são obrigatórios' });

  try {
    // A Steam aceita até ~100 IDs por vez nesta URL
    const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${ids}`);
    const data = await response.json();
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Falha na busca em lote' });
  }
}