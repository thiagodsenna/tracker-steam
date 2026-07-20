export default async function handler(req, res) {
  const { query } = req.query;
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!query) {
    return res.status(400).json({ error: 'Termo de busca é obrigatório' });
  }

  try {
    const searchUrl = `https://www.skidrowreloaded.com/?s=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const html = await response.text();

    // Regex para capturar os links dos posts, títulos e imagens
    // O Skidrow usa <div class="post-thumb"> para a imagem e <h2 class="post-title"> para o título
    const postBlockRegex = /<div class="post-thumb">[\s\S]*?<img[\s\S]*?src="([^"]+)"[\s\S]*?<h2 class="post-title">\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
    
    let matches;
    const posts = [];

    while ((matches = postBlockRegex.exec(html)) !== null && posts.length < 30) {
      const imgUrl = matches[1];
      const postUrl = matches[2];
      const title = matches[3];
      
      posts.push({
        id: `skidrow-${postUrl}`,
        title: title,
        visual: { url: imgUrl },
        alternate: [{ href: postUrl }],
        published: new Date().toISOString() // Fallback data
      });
    }

    return res.status(200).json({ items: posts });
  } catch (error) {
    console.error("Erro Skidrow Search:", error);
    return res.status(500).json({ error: 'Falha ao buscar no Skidrow' });
  }
}
