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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!response.ok) {
      throw new Error(`Status: ${response.status}`);
    }

    const html = await response.text();

    const regexLinks = /<h2>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
    let match;
    const postLinks = [];

    while ((match = regexLinks.exec(html)) !== null && postLinks.length < 15) {
      postLinks.push({ url: match[1], titleFallback: match[2] });
    }

    const postsDetailed = await Promise.all(
      postLinks.map(async ({ url, titleFallback }) => {
        try {
          const detailRes = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          const detailHtml = await detailRes.text();

          const titleMatch = detailHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || detailHtml.match(/<title>([\s\S]*?)<\/title>/i);
          let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/ - Skidrow Reloaded.*/i, '').trim() : titleFallback;

          const timeMatch = detailHtml.match(/<time[^>]+datetime="([^"]+)"/i) || detailHtml.match(/class="time"[^>]*>([^<]+)<\//i);
          const published = timeMatch ? timeMatch[1].trim() : new Date().toISOString();

          let contentHtml = '';
          const contentStart = detailHtml.search(/class="(?:post|entry)-content|post-excerpt/i);
          if (contentStart !== -1) {
            contentHtml = detailHtml.slice(contentStart, contentStart + 20000);
          } else {
            contentHtml = detailHtml;
          }

          // ===== NOVO FILTRO DE IMAGEM INTELIGENTE =====
          // Varre todas as imagens e ignora logos do site, avatares e ícones do tema
          const imgMatches = [...contentHtml.matchAll(/<img[^>]+src="([^"]+)"/gi)];
          let imgUrl = '';
          
          for (const m of imgMatches) {
            const urlLower = m[1].toLowerCase();
            if (
              !urlLower.includes('logo') && 
              !urlLower.includes('avatar') && 
              !urlLower.includes('icon') && 
              !urlLower.includes('themes') && 
              !urlLower.includes('plugins') &&
              !urlLower.includes('smiley')
            ) {
              imgUrl = m[1];
              break; // Achou a capa legítima do jogo, pode parar de procurar!
            }
          }
          // =============================================

          return {
            id: `skidrow-${url}`,
            title: title,
            visual: { url: imgUrl },
            alternate: [{ href: url }],
            published: published,
            content: { content: contentHtml } 
          };
        } catch (e) {
          console.error(`Erro ao processar jogo ${url}:`, e);
          return null;
        }
      })
    );

    const validPosts = postsDetailed.filter(p => p !== null);

    return res.status(200).json({ items: validPosts });
  } catch (error) {
    console.error("Erro Skidrow Search:", error);
    return res.status(500).json({ error: 'Falha ao buscar no Skidrow' });
  }
}