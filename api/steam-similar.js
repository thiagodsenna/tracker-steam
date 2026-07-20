export default async function handler(req, res) {
  const { appid } = req.query;
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (!appid) {
    return res.status(400).json({ error: 'AppID é obrigatório' });
  }

  try {
    // 1. Busca o HTML da página oficial do jogo na loja da Steam
    const storeRes = await fetch(`https://store.steampowered.com/app/${appid}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8'
      }
    });

    if (!storeRes.ok) throw new Error('Falha ao acessar a loja da Steam');
    
    const html = await storeRes.text();
    
    // 2. Isolamos o bloco "More Like This" (Recomendados) para não pegar links aleatórios do topo/rodapé
    // A Steam coloca essa seção em uma div com id="recommended_block" ou class="similar_grid"
    let recommendedBlock = '';
    const blockIndex = html.search(/id="recommended_block"|class="similar_grid"/i);
    
    if (blockIndex !== -1) {
      // Recortamos 15 mil caracteres a partir de onde o bloco começa
      recommendedBlock = html.slice(blockIndex, blockIndex + 15000);
    } else {
      // Fallback de segurança: se o layout mudar, varre o HTML todo
      recommendedBlock = html;
    }

    // 3. Extraímos os IDs dos jogos dentro desse bloco via Regex nativo
    // Padrão dos links da loja: https://store.steampowered.com/app/123456/...
    const regexIds = /store\.steampowered\.com\/app\/(\d+)/gi;
    let match;
    const similarIds = [];
    
    // O Set garante que não haverá IDs repetidos E já exclui o próprio jogo atual da lista!
    const seenIds = new Set([appid.toString()]); 

    while ((match = regexIds.exec(recommendedBlock)) !== null && similarIds.length < 6) {
      const foundId = match[1];
      if (!seenIds.has(foundId)) {
        seenIds.add(foundId);
        similarIds.push(foundId);
      }
    }

    // Se o jogo for muito obscuro e não tiver recomendações, retorna array vazio
    if (similarIds.length === 0) {
      return res.status(200).json({ success: true, items: [] });
    }

    // 4. Com os 6 IDs oficiais em mãos, buscamos Título e Capa via API leve (&filters=basic)
    const similarGames = await Promise.all(
      similarIds.map(async (id) => {
        try {
          const steamRes = await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic`);
          const steamJson = await steamRes.json();
          
          if (steamJson[id]?.success) {
            const data = steamJson[id].data;
            return {
              id: id,
              name: data.name,
              cover: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`
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