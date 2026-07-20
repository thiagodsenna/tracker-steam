export default async function handler(req, res) {
  const { query } = req.query;
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!query) {
    return res.status(400).json({ error: 'Termo de busca é obrigatório' });
  }

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    };

    const encodedQuery = encodeURIComponent(query);
    const urlPage1 = `https://www.skidrowreloaded.com/?s=${encodedQuery}`;
    const urlPage2 = `https://www.skidrowreloaded.com/page/2/?s=${encodedQuery}`;

    const [resPage1, resPage2] = await Promise.all([
      fetch(urlPage1, { headers }).catch(() => null),
      fetch(urlPage2, { headers }).catch(() => null)
    ]);

    let combinedHtml = '';
    if (resPage1 && resPage1.ok) combinedHtml += await resPage1.text();
    if (resPage2 && resPage2.ok) combinedHtml += await resPage2.text();

    if (!combinedHtml) {
      throw new Error('Não foi possível obter o HTML das páginas de busca.');
    }

    const regexPosts = /<h2>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?Posted\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/gi;
    
    let match;
    const postLinks = [];
    const seenUrls = new Set();

    while ((match = regexPosts.exec(combinedHtml)) !== null && postLinks.length < 25) {
      const url = match[1];
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        postLinks.push({
          url: url,
          titleFallback: match[2].trim(),
          dateFallback: match[3].trim()
        });
      }
    }

    if (postLinks.length === 0) {
      const regexSimple = /<h2>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
      while ((match = regexSimple.exec(combinedHtml)) !== null && postLinks.length < 25) {
        const url = match[1];
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          postLinks.push({ url: url, titleFallback: match[2].trim(), dateFallback: new Date().toISOString() });
        }
      }
    }

    const postsDetailed = await Promise.all(
      postLinks.map(async ({ url, titleFallback, dateFallback }) => {
        try {
          const detailRes = await fetch(url, { headers });
          if (!detailRes.ok) return null;
          const detailHtml = await detailRes.text();

          // ===== LIMPEZA DEFINITIVA DO TÍTULO =====
          const titleMatch = detailHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
          let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : titleFallback;

          // Remove códigos HTML (&amp;, &#8211; etc) e qualquer variação de Skidrow Reloaded do final
          title = title
            .replace(/&#\d+;|&[a-z]+;/gi, ' ') // Transforma entidades HTML em espaços
            .replace(/[-–—]\s*(?:Skidrow|Reloaded|Games|Scene|PC|FREE|DOWNLOAD).*/i, '')
            .replace(/Skidrow\s*&?\s*Reloaded\s*Games.*/i, '')
            .replace(/\s+/g, ' ') // Remove espaços duplos
            .trim();
          
          // Se depois de limpar tudo ficar vazio, usa o fallback original da busca limpo
          if (!title) {
              title = titleFallback.replace(/&#\d+;|&[a-z]+;/gi, ' ').trim();
          }
          // ========================================

          const dateMatch = detailHtml.match(/Posted\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
          const published = dateMatch ? dateMatch[1].trim() : dateFallback;

          let contentHtml = '';
          const contentStart = detailHtml.search(/class="(?:post|entry)-content|post-excerpt/i);
          if (contentStart !== -1) {
            contentHtml = detailHtml.slice(contentStart, contentStart + 20000);
          } else {
            contentHtml = detailHtml;
          }

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
              break;
            }
          }

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