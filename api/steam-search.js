export default async function handler(req, res) {
  const { term } = req.query;
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!term) return res.status(400).json({ error: 'Termo de busca é obrigatório' });

  try {
    const response = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=brazilian&cc=BR`);
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Falha ao buscar na Steam' });
  }
}
