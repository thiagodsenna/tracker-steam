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
        // User-Agent completo para evitar bloqueios de segurança do site
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });
    
    if (!response.ok) {
        throw new Error(`O servidor retornou status: ${response.status}`);
    }

    const html = await response.text();

    // REGEX CORRIGIDO:
    // 1. Busca o <h2> contendo o link (href) e o título (Grupo 1 = Link, Grupo 2 = Título)
    // 2. Avança até a <div class="post-excerpt">
    // 3. Captura o src da primeira imagem (Grupo 3 = Imagem)
    const postRegex = /<h2>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>\s*<\/h2>[\s\S]*?<div class="post-excerpt">[\s\S]*?<img[^>]+src="([^"]+)"/g;
    
    let matches;
    const posts = [];

    while ((matches = postRegex.exec(html)) !== null && posts.length < 30) {
      const postUrl = matches[1];
      const title = matches[2];
      const imgUrl = matches[3];
      
      posts.push({
        id: `skidrow-${postUrl}`,
        title: title.trim(),
        visual: { url: imgUrl },
        alternate: [{ href: postUrl }],
        published: new Date().toISOString()
      });
    }

    return res.status(200).json({ items: posts });
  } catch (error) {
    console.error("Erro Skidrow Search:", error);
    return res.status(500).json({ error: 'Falha ao buscar no Skidrow' });
  }
}