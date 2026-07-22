export default async function handler(req, res) {
  // Configura CORS para aceitar requisições do seu app local e em produção
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL da imagem é obrigatória' });
  }

  try {
    // Faz a requisição da imagem simulando um navegador comum
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Falha ao buscar a imagem de origem' });
    }

    // Pega o tipo da imagem (jpeg, png, webp, etc.)
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const imageBuffer = await response.arrayBuffer();

    // Cache no navegador e CDN da Vercel por 1 dia para não sobrecarregar as chamadas
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate');

    // Retorna o buffer da imagem diretamente
    return res.status(200).send(Buffer.from(imageBuffer));
  } catch (error) {
    console.error('Erro no cover-proxy:', error);
    return res.status(500).json({ error: 'Erro interno ao processar a imagem' });
  }
}