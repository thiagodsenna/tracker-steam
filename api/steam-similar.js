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
    
    // 1. ISOLA A SEÇÃO DE SIMILARES (Evita pegar DLCs)
    // Procuramos especificamente pela área "More Like This" ou blocos de grid de similares
    let targetBlock = '';
    
    // Tenta achar o bloco de similares oficial da página da Steam
    const similarIndex = html.search(/class="carousel_items\s+similar_grid"|data-subtab="similar_games"|MoreLikeThis/i);
    
    if (similarIndex !== -1) {
      targetBlock = html.slice(similarIndex, similarIndex + 20000);
    } else {
      // Fallback: Procura por qualquer bloco após a menção de jogos similares
      const altIndex = html.search(/More Like This|Ver Similares/i);
      targetBlock = altIndex !== -1 ? html.slice(altIndex, altIndex + 25000) : html;
    }

    // 2. EXTRAI APENAS APPs DE JOGOS (Exclui pacotes/sub e DLCs se possível através dos links /app/)
    const regexIds = /store\.steampowered\.com\/app\/(\d+)/gi;
    let match;
    const similarIds = [];
    const seenIds = new Set([appid.toString()]); 

    while ((match = regexIds.exec(targetBlock)) !== null && similarIds.length < 6) {
      const foundId = match[1];
      if (!seenIds.has(foundId)) {
        seenIds.add(foundId);
        similarIds.push(foundId);
      }
    }

    if (similarIds.length === 0) {
      return res.status(200).json({ success: true, items: [] });
    }

    // 3. BUSCA DETALHES E USA O LINK DE CAPA ESTÁVEL DA STEAM
    const similarGames = await Promise.all(
      similarIds.map(async (id) => {
        try {
          const steamRes = await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic`);
          const steamJson = await steamRes.json();
          
          if (steamJson[id]?.success) {
            const data = steamJson[id].data;
            
            // Ignora se por acaso vier marcado como DLC no tipo da Steam
            if (data.type && data.type === 'dlc') return null;

            return {
              id: id,
              name: data.name,
              // URL padrão ultra-estável da CDN da Steam que não quebra
              cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`
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