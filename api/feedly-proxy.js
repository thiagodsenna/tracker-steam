export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Lê qual ação o frontend está pedindo através de um parâmetro (ex: ?action=list)
    const { action, query, id } = req.query;

    try {
        switch (action) {
            case 'list':
                let url = 'https://api.feedly.com/v3/streams/contents?streamId=feed%2Fhttps%3A%2F%2Fwww.skidrowreloaded.com%2Fcategory%2Fpc-games%2Ffeed%2F&count=200&ranked=newest&similar=true&ct=feedly.desktop&cv=31.0.3081';

                if (query) {
                  // A API de busca pública do Feedly (v3/search/contents) requer Token. 
                  // Como alternativa, usaremos o filtro local na listagem completa do stream que já funciona sem token.
                  url = 'https://api.feedly.com/v3/streams/contents?streamId=feed%2Fhttps%3A%2F%2Fwww.skidrowreloaded.com%2Fcategory%2Fpc-games%2Ffeed%2F&count=1000&ranked=newest&ct=feedly.desktop&cv=31.0.3081';
                }

                try {
                  const response = await fetch(url);
                  let data = await response.json();

                  if (query && data.items) {
                    const q = query.toLowerCase();
                    data.items = data.items.filter(item => 
                      (item.title && item.title.toLowerCase().includes(q)) || 
                      (item.summary && item.summary.content && item.summary.content.toLowerCase().includes(q)) ||
                      (item.content && item.content.content && item.content.content.toLowerCase().includes(q))
                    );
                  }

                  // =================================================================
                  // --- INÍCIO: MERGE COM CACHE STEAM & LAZY SEEDING ---
                  // =================================================================
                  const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
                  const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
                  
                  let steamCache = {};
                  let destaquesHome = [];

                  if (KV_URL && KV_TOKEN) {
                      try {
                          // Busca o cache de metadados e os destaques em paralelo
                          const [cacheRes, destRes] = await Promise.all([
                              fetch(`${KV_URL}/get/steam_metadata_cache`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } }),
                              fetch(`${KV_URL}/get/destaques_home`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } })
                          ]);
                          
                          const cacheData = await cacheRes.json();
                          const destData = await destRes.json();

                          if (cacheData && cacheData.result) {
                              steamCache = typeof cacheData.result === 'string' ? JSON.parse(cacheData.result) : cacheData.result;
                          }
                          if (destData && destData.result) {
                              destaquesHome = typeof destData.result === 'string' ? JSON.parse(destData.result) : destData.result;
                          }

                          // --- REGRA DE LAZY SEEDING (Auto-abastecimento inicial) ---
                          // Se o cache estiver vazio, processa os 10 primeiros itens do feed que tenham Steam ID
                          if (Object.keys(steamCache).length === 0 && data.items && data.items.length > 0) {
                              const itensParaSeed = data.items.slice(0, 15);
                              
                              await Promise.allSettled(itensParaSeed.map(async (item) => {
                                  const content = item.content?.content || item.summary?.content || '';
                                  const match = content.match(/(?:store\.steampowered\.com|steamcommunity\.com)\/app\/(\d+)/i);
                                  const steamId = match ? match[1] : null;

                                  if (steamId && !steamCache[steamId]) {
                                      try {
                                          // Busca detalhes básicos (agora incluindo "background") e reviews
                                          const [detRes, revRes] = await Promise.all([
                                              fetch(`https://store.steampowered.com/api/appdetails?appids=${steamId}&filters=basic,release_date,genres,developers,screenshots,categories,movies,background`),
                                              fetch(`https://store.steampowered.com/appreviews/${steamId}?json=1&filter=all&language=all&day_range=1000&num_per_page=1`)
                                          ]);
                                          
                                          const detJson = await detRes.json();
                                          const revJson = await revRes.json();

                                          if (detJson[steamId]?.success) {
                                              const gData = detJson[steamId].data;
                                              let nota = 0;
                                              let totalReviews = 0;

                                              if (revJson && revJson.success && revJson.query_summary) {
                                                  totalReviews = revJson.query_summary.total_reviews || 0;
                                                  if (totalReviews > 0) {
                                                      nota = Math.trunc((revJson.query_summary.total_positive * 100) / totalReviews);
                                                  }
                                              }

                                              steamCache[steamId] = {
                                                  name: gData.name,
                                                  header_image: gData.header_image,
                                                  background_raw: gData.background_raw || gData.background || '',
                                                  release_date: gData.release_date,
                                                  genres: gData.genres || [],
                                                  developers: gData.developers || [],
                                                  screenshots: gData.screenshots || [],
                                                  categories: gData.categories || [],
                                                  movies: gData.movies || [],
                                                  short_description: gData.short_description || '',
                                                  rating: nota,
                                                  total_reviews: totalReviews
                                              };
                                          }
                                      } catch (e) { /* Falha silenciosa no seed individual */ }
                                  }
                              }));

                              // Salva o cache inicial semeado no Vercel KV
                              if (Object.keys(steamCache).length > 0) {
                                  await fetch(`${KV_URL}/set/steam_metadata_cache`, {
                                      method: 'POST',
                                      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
                                      body: JSON.stringify(steamCache)
                                  });
                              }
                          }

                          // =================================================================
                          // --- NOVO: CÁLCULO DE RESERVA DE DESTAQUES (AUTO-ABASTECIMENTO) ---
                          // =================================================================
                          if (destaquesHome.length === 0 && Object.keys(steamCache).length > 0) {
                              try {
                                  const listaJogos = Object.entries(steamCache).map(([id, dados]) => {
                                      const nota = dados.rating || 0;
                                      const revs = Math.max(dados.total_reviews || 1, 1);
                                      let score = (nota * 0.7) + (Math.log10(revs) * 10 * 0.3);

                                      // Prioridade absoluta para releases contendo "voices38"
                                      const temVoices38 = data.items && data.items.some(i => 
                                          /voices38/i.test(i.title || '') && (i.content?.content || i.summary?.content || '').includes(id)
                                      );
                                      if (temVoices38) score += 100000;

                                      return { steamId: id, score, ...dados };
                                  });

                                  listaJogos.sort((a, b) => b.score - a.score);
                                  destaquesHome = listaJogos.slice(0, 5);

                                  if (destaquesHome.length > 0) {
                                      await fetch(`${KV_URL}/set/destaques_home`, {
                                          method: 'POST',
                                          headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
                                          body: JSON.stringify(destaquesHome)
                                      });
                                  }
                              } catch (errDest) {
                                  console.error("Erro ao gerar destaques de reserva no proxy:", errDest);
                              }
                          }
                          // =================================================================

                      } catch (kvErr) {
                          console.error("Erro ao ler/semear KV no proxy:", kvErr);
                      }
                  }

                  // Injeta os dados detalhados da Steam direto em cada item do Feedly
                  if (data.items) {
                      data.items = data.items.map(item => {
                          const content = item.content?.content || item.summary?.content || '';
                          const match = content.match(/(?:store\.steampowered\.com|steamcommunity\.com)\/app\/(\d+)/i);
                          const steamId = match ? match[1] : null;

                          return {
                              ...item,
                              steamDetails: (steamId && steamCache[steamId]) ? steamCache[steamId] : null
                          };
                      });
                  }
                  // =================================================================
                  // --- FIM: MERGE COM CACHE STEAM & LAZY SEEDING ---
                  // =================================================================
                  
                  // Retorna os itens enriquecidos E a lista de destaques pronta
                  return res.status(200).json({
                      ...data,
                      destaques: destaquesHome
                  });
                } catch (error) {
                  return res.status(500).json({ error: 'Falha ao buscar feedly' });
                }

            case 'entry':
                if (!id) {
                  return res.status(400).json({ error: 'ID é obrigatório' });
                }

                try {
                  const response = await fetch(
                    `https://api.feedly.com/v3/entries/${encodeURIComponent(id)}`
                  );

                  if (!response.ok) {
                    return res.status(response.status).json({ error: 'Item não encontrado no Feedly' });
                  }

                  const data = await response.json();
                  const item = Array.isArray(data) ? data[0] : data;

                  if (!item?.id) {
                    return res.status(404).json({ error: 'Item não encontrado no Feedly' });
                  }

                  return res.status(200).json(item);
                } catch (error) {
                  return res.status(500).json({ error: 'Falha ao buscar item no Feedly' });
                }

            default:
                return res.status(400).json({ error: 'Ação inválida.' });
        }
    } catch (error) {
        return res.status(500).json({ error: 'Erro interno no servidor.' });
    }
}