export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Lê qual ação o frontend está pedindo através de um parâmetro (ex: ?action=reviews)
    const { action, appid, term, ids } = req.query;

    try {
        switch (action) {
            case 'detail':
                // Lógica antiga do steam-proxy.js
                if (!appid) return res.status(400).json({ error: 'AppID é obrigatório' });
                try {
                  const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=brazilian&cc=BR`, {
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                      'Cookie': 'birthtime=283993200; mature_content=1; lastagecheckage=1-0-1990',
                      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
                    }
                  });
                  const data = await response.json();
                  return res.status(200).json(data);
                } catch (error) {
                  return res.status(500).json({ error: 'Falha ao conectar com Steam' });
                }

            case 'search':
                // Lógica antiga do steam-search.js
                if (!term) return res.status(400).json({ error: 'Termo de busca é obrigatório' });
                try {
                  const response = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=brazilian&cc=BR`);
                  const data = await response.json();
                  return res.status(200).json(data);
                } catch (error) {
                  return res.status(500).json({ error: 'Falha ao buscar na Steam' });
                }

            case 'reviews':
                if (!appid) return res.status(400).json({ error: 'AppID é obrigatório' });
                try {
                  const inputJson = {
                      appid: parseInt(appid),
                      filter: 0, // 0 = Helpful (equivalente ao antigo 'all')
                      languages: ["all"],
                      day_range: 1000,
                      num_per_page: 40
                  };
                  
                  const apiUrl = `https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?input_json=${encodeURIComponent(JSON.stringify(inputJson))}`;

                  const response = await fetch(apiUrl, {
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                      'Cookie': 'birthtime=283993200; mature_content=1; lastagecheckage=1-0-1990'
                    }
                  });
                  
                  const text = await response.text();
                  
                  try {
                      const data = JSON.parse(text);
                      let result = data.response || data;
                      // Injeta a chave 'success' artificialmente para não quebrar a validação 
                      // if(json.success && json.reviews) existente no seu scripts.js
                      result.success = true;
                      return res.status(200).json(result);
                      
                  } catch (parseError) {
                      console.error(`Falha no parse do novo endpoint para o AppID ${appid}`);
                      console.error("Conteúdo recebido:", text.substring(0, 150));
                      
                      return res.status(200).json({ 
                          success: false, 
                          query_summary: { total_reviews: 0, total_positive: 0 }, 
                          reviews: [] 
                      });
                  }
                } catch (error) {
                  console.error("Erro interno ao buscar reviews:", error);
                  return res.status(500).json({ error: 'Falha ao buscar reviews da Steam' });
                }

            case 'similar': {
                if (!appid) return res.status(400).json({ error: 'AppID é obrigatório' });
                try {
                    const steamUrl = `https://store.steampowered.com/recommended/morelike/app/${appid}?l=brazilian&cc=BR`;
                    const steamRes = await fetch(steamUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            // Adicionada a flag 'lastagecheckage' para ignorar o redirecionamento de idade da Steam
                            'Cookie': 'birthtime=283993200; mature_content=1; lastagecheckage=1-0-1990'
                        }
                    });

                    if (!steamRes.ok) return res.status(200).json({ success: false, items: [] });

                    const html = await steamRes.text();
                    const items = [];
                    const seenIds = new Set();

                    // Regex ajustado para capturar links relativos ou absolutos e remover tags HTML internas do título
                    const matches = [...html.matchAll(/href="(?:https:\/\/store\.steampowered\.com)?\/app\/(\d+)[^"]*"[\s\S]*?<div class="tab_item_name">([\s\S]*?)<\/div>/gi)];

                    for (const m of matches) {
                        const id = m[1];
                        const name = m[2].replace(/<[^>]+>/g, '').trim();
                        if (name && !seenIds.has(id) && id !== appid) {
                            seenIds.add(id);
                            items.push({
                                id: id,
                                name: name,
                                cover: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`
                            });
                        }
                        if (items.length >= 6) break;
                    }

                    return res.status(200).json({ success: true, items });
                } catch (e) {
                    console.error('[Steam Proxy Similar Error]:', e);
                    return res.status(200).json({ success: false, items: [] });
                }
            }

            default:
                return res.status(400).json({ error: 'Ação inválida.' });
        }
    } catch (error) {
        return res.status(500).json({ error: 'Erro interno no servidor.' });
    }
}