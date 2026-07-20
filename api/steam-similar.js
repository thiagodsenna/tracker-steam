export default async function handler(req, res) {
  const { appid } = req.query;
  res.setHeader('Access-Control-Allow-Origin', '*');
  console.log('entrou steam similar 1');
  
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

    console.log('retornou steam similar 2', storeRes);

    if (!storeRes.ok) throw new Error('Falha ao acessar a loja da Steam');
    
    const html = await storeRes.text();
    console.log('steam similar html 3', html);
    
    let similarIds = [];

    // 1. CAPTURA INTELIGENTE PELO DATA-PROPS:
    // Corrigido para buscar o título em inglês "More like this" que é o padrão retornado pelo Steam no HTML fornecido
    const regexProps = /data-featuretarget="storeitems-carousel"[^>]*data-props="([^"]+)"/gi;
    let match;

    while ((match = regexProps.exec(html)) !== null) {
      try {
        // Converte as entidades HTML escapadas (&quot;) para aspas normais
        const decodedJson = match[1].replace(/&quot;/g, '"');
        const props = JSON.parse(decodedJson);

        // Verifica se o carrossel corresponde a "More like this" e se possui o array appIDs
        if (props.title === "More like this" && Array.isArray(props.appIDs)) {
          similarIds = props.appIDs;
          break; // Achou exatamente o carrossel de similares, encerra a busca
        }
      } catch (err) {
        continue;
      }
    }

    // 2. FALLBACK DE SEGURANÇA (Caso o layout mude ou o título varie)
    if (similarIds.length === 0) {
      const fallbackMatch = html.match(/"appIDs":\s*\[([\d,\s]+)\]/);
      if (fallbackMatch) {
        similarIds = fallbackMatch[1].split(',').map(id => id.trim());
      }
    }

    // Pega apenas os primeiros 6 jogos para preencher o grid com agilidade
    const topSimilarIds = similarIds.slice(0, 6);

    if (topSimilarIds.length === 0) {
      return res.status(200).json({ success: true, items: [], html: html });
    }

    // 3. BUSCA OS DETALHES DE CADA JOGO EM PARALELO (&filters=basic)
    const similarGames = await Promise.all(
      topSimilarIds.map(async (id) => {
        try {
          const steamRes = await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic`);
          const steamJson = await steamRes.json();
          
          if (steamJson[id]?.success) {
            const data = steamJson[id].data;
            
            // Garante que não é uma DLC perdida no meio dos IDs
            if (data.type && data.type === 'dlc') return null;

            return {
              id: id,
              name: data.name,
              // URL oficial e estável da Cloudflare/Steam para a capa horizontal
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

    return res.status(200).json({ success: true, items: validGames, html: html });
  } catch (error) {
    console.error("Erro em jogos similares:", error);
    return res.status(500).json({ error: 'Falha ao buscar jogos similares' });
  }
}