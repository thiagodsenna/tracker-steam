export default async function handler(req, res) {
  const { query } = req.query;
  
  let url = 'https://api.feedly.com/v3/streams/contents?streamId=feed%2Fhttps%3A%2F%2Fwww.skidrowreloaded.com%2Fcategory%2Fpc-games%2Ffeed%2F&count=200&ranked=newest&similar=true&ct=feedly.desktop&cv=31.0.3081';

  if (query) {
    // Para busca, usamos o endpoint de busca do feedly filtrando pelo streamId do Skidrow
    url = `https://api.feedly.com/v3/search/contents?query=${encodeURIComponent(query)}&streamId=feed%2Fhttps%3A%2F%2Fwww.skidrowreloaded.com%2Fcategory%2Fpc-games%2Ffeed%2F&count=200`;
  }

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    // Libera o CORS para o seu site
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Falha ao buscar feedly' });
  }
}