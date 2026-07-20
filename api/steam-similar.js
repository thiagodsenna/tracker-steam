export default async function handler(req, res) {
  const { appid } = req.query;
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (!appid) {
    return res.status(400).json({ error: 'AppID é obrigatório' });
  }

  try {
    const storeRes = await fetch(`https://store.steampowered.com/app/${appid}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8'
      }
    });

    if (!storeRes.ok) throw new Error('Falha ao acessar a loja da Steam');
    
    const html = await storeRes.text();
    
    let similarIds = [];

    // 1. CAPTURA INTELIGENTE PELO DATA-PROPS:
    const regexProps = /data-featuretarget="storeitems-carousel"[^>]*data-props="([^"]+)"/gi;
    let match;

    while ((match = regexProps.exec(html)) !== null) {
      try {
        const decodedJson = match[1].replace(/&quot;/g, '"');
        const props = JSON.parse(decodedJson);

        if (props.title === "More like this" && Array.isArray(props.appIDs)) {
          similarIds = props.appIDs;
          break;
        }
      } catch (err) {
        continue;
      }
    }

    // 2. FALLBACK DE SEGURANÇA PARA OS IDS
    if (similarIds.length === 0) {
      const fallbackMatch = html.match(/"appIDs":\s*\[([\d,\s]+)\]/);
      if (fallbackMatch) {
        similarIds = fallbackMatch[1].split(',').map(id => id.trim());
      }
    }

    const topSimilarIds = similarIds.slice(0, 10);

    if (topSimilarIds.length === 0) {
      return res.status(200).json({ success: true, items: [] });
    }

    // 3. BUSCA OS DETALHES DE CADA JOGO COM FALLBACK DE CAPAS
    const similarGames = await Promise.all(
      topSimilarIds.map(async (id) => {
        try {
          const steamRes = await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic`);
          const steamJson = await steamRes.json();
          
          if (steamJson[id]?.success) {
            const data = steamJson[id].data;
            
            if (data.type && data.type === 'dlc') return null;

            // Estratégia de Fallback para a Capa:
            // 1. Tenta usar a imagem de cabeçalho oficial fornecida diretamente pela API da Steam
            // 2. Se não houver, recorre ao CDN padrão do Cloudflare
            // 3. Como último caso, aponta para o header genérico da store
            const coverImage = data.header_image 
              || `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`
              || `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`;

            return {
              id: id,
              name: data.name,
              cover: coverImage
            };
          }
          return null;
        } catch (e) {
          return null;
        }
      })
    );

    const validGames = similarGames.filter(g => g !== null);

    return res.status(200).json({ success: true, items: validGames });
  } catch (error) {
    console.error("Erro em jogos similares:", error);
    return res.status(500).json({ error: 'Falha ao buscar jogos similares' });
  }
}