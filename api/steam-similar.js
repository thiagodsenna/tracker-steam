export default async function handler(req, res) {
  const { appid } = req.query;
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (!appid) {
    return res.status(400).json({ error: 'AppID é obrigatório' });
  }

  try {
    // 1. Busca os IDs dos jogos similares usando a API pública do SteamSpy
    const spyRes = await fetch(`https://steamspy.com/api.php?request=appdetails&appid=${appid}`);
    if (!spyRes.ok) throw new Error('Falha ao conectar com SteamSpy');
    
    const spyData = await spyRes.json();
    
    // O campo "similar" retorna um objeto { "appid": pontuação, ... }. Pegamos os 6 primeiros IDs.
    const similarIds = Object.keys(spyData.similar || {}).slice(0, 6);

    if (similarIds.length === 0) {
      return res.status(200).json({ success: true, items: [] });
    }

    // 2. Para cada ID similar, buscamos o Nome e Capa na própria Steam em PARALELO
    // O parâmetro &filters=basic torna a resposta da Steam ultrarrápida e leve!
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
              // Usamos a capa horizontal oficial da Steam (header.jpg), ideal para grids compactos
              cover: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`
            };
          }
          return null;
        } catch (e) {
          return null;
        }
      })
    );

    // Filtra possíveis erros ou jogos removidos da loja
    const validGames = similarGames.filter(g => g !== null);

    return res.status(200).json({ success: true, items: validGames });
  } catch (error) {
    console.error("Erro em jogos similares:", error);
    return res.status(500).json({ error: 'Falha ao buscar jogos similares' });
  }
}