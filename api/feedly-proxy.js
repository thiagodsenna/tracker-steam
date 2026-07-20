export default async function handler(req, res) {
  const { query } = req.query;
  
  let url = 'https://api.feedly.com/v3/streams/contents?streamId=feed%2Fhttps%3A%2F%2Fwww.skidrowreloaded.com%2Fcategory%2Fpc-games%2Ffeed%2F&count=200&ranked=newest&similar=true&ct=feedly.desktop&cv=31.0.3081';

  if (query) {
    // A API de busca pública do Feedly (v3/search/contents) requer Token. 
    // Como alternativa, usaremos o filtro local na listagem completa do stream que já funciona sem token.
    url = 'https://api.feedly.com/v3/streams/contents?streamId=feed%2Fhttps%3A%2F%2Fwww.skidrowreloaded.com%2Fcategory%2Fpc-games%2Ffeed%2F&count=1000&ranked=newest&ct=feedly.desktop&cv=31.0.3081';
  }

  try {
    const response = await fetch(url);
    let data = await response.json();

    if (query && data.items) {
      const q = query.toLowerCase();
      data.items = data.items.filter(item => 
        (item.title && item.title.toLowerCase().includes(q)) || 
        (item.summary && item.summary.content && item.summary.content.toLowerCase().includes(q)) ||
        (item.content && item.content.content && item.content.content.toLowerCase().includes(q))
      );
    }
    
    // Libera o CORS para o seu site
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Falha ao buscar feedly' });
  }
}