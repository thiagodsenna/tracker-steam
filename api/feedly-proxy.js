export default async function handler(req, res) {
    // Configurações de CORS para permitir requisições cross-origin da aplicação web
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    // Trata requisições preflight (OPTIONS)
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { action, query, id } = req.query;

    try {
        switch (action) {
            case 'skidrow-json': {
                // Consulta a API REST nativa em JSON do WordPress (Skidrow)
                // Utiliza os parâmetros _embed (para trazer a mídia destacada) e _fields (para otimizar payload)
                let wpUrl = 'https://www.skidrowreloaded.com/wp-json/wp/v2/posts?per_page=100&_embed&_fields=id,date,date_gmt,link,title,content,excerpt,_links,_embedded';

                if (query) {
                    wpUrl += `&search=${encodeURIComponent(query)}`;
                }

                let wpPosts = null;
                let usandoFallbackFeedly = false;

                try {
                    // Simulação completa de cabeçalhos HTTP de um navegador real para evitar bloqueios Cloudflare/WAF (403 Forbidden)
                    const response = await fetch(wpUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                            'Accept': 'application/json, text/plain, */*',
                            'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
                            'Referer': 'https://www.skidrowreloaded.com/',
                            'Origin': 'https://www.skidrowreloaded.com',
                            'Sec-Fetch-Dest': 'empty',
                            'Sec-Fetch-Mode': 'cors',
                            'Sec-Fetch-Site': 'same-origin',
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache'
                        }
                    });

                    if (response.ok) {
                        wpPosts = await response.json();
                    } else {
                        console.warn(`Skidrow WP API retornou status ${response.status}. Ativando fallback para Feedly.`);
                        usandoFallbackFeedly = true;
                    }
                } catch (wpErr) {
                    console.error('Erro de conexão com Skidrow WP API:', wpErr);
                    usandoFallbackFeedly = true;
                }

                let items = [];

                // FALLBACK: Se a API WP retornar 403/404 ou falhar, recorre à API do Feedly como redundância
                if (usandoFallbackFeedly || !wpPosts) {
                    let feedlyUrl = 'https://api.feedly.com/v3/streams/contents?streamId=feed%2Fhttps%3A%2F%2Fwww.skidrowreloaded.com%2Fcategory%2Fpc-games%2Ffeed%2F&count=200&ranked=newest&similar=true&ct=feedly.desktop&cv=31.0.3081';
                    if (query) {
                        feedlyUrl = 'https://api.feedly.com/v3/streams/contents?streamId=feed%2Fhttps%3A%2F%2Fwww.skidrowreloaded.com%2Fcategory%2Fpc-games%2Ffeed%2F&count=1000&ranked=newest&ct=feedly.desktop&cv=31.0.3081';
                    }

                    const feedlyRes = await fetch(feedlyUrl);
                    if (!feedlyRes.ok) {
                        return res.status(feedlyRes.status).json({ error: 'Falha ao buscar dados do Skidrow e do Feedly.' });
                    }
                    const feedlyData = await feedlyRes.json();
                    items = feedlyData.items || [];
                } else {
                    // Mapeamento dos posts do WordPress para a estrutura padrão de itens do Feedly
                    items = Array.isArray(wpPosts) ? wpPosts.map(post => {
                        const featuredMedia = post._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';
                        return {
                            id: String(post.id),
                            title: decodeHTMLEntities(post.title?.rendered || post.title || ''),
                            published: new Date(post.date_gmt ? (post.date_gmt.endsWith('Z') ? post.date_gmt : post.date_gmt + 'Z') : post.date).getTime(),
                            content: { content: post.content?.rendered || '' },
                            summary: { content: post.excerpt?.rendered || '' },
                            alternate: [{ href: post.link || '' }],
                            visual: featuredMedia ? { url: featuredMedia } : undefined
                        };
                    }) : [];
                }

                // Filtro local adicional para busca por termo caso a busca retorne amplo
                if (query && items.length > 0) {
                    const q = query.toLowerCase();
                    items = items.filter(item => 
                        (item.title && item.title.toLowerCase().includes(q)) || 
                        (item.summary?.content && item.summary.content.toLowerCase().includes(q)) ||
                        (item.content?.content && item.content.content.toLowerCase().includes(q))
                    );
                }

                const data = { items };

                // =================================================================
                // --- INÍCIO: MERGE COM CACHE STEAM & LAZY SEEDING ---
                // =================================================================
                const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
                const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
                
                let steamCache = {};
                let destaquesHome = [];

                if (KV_URL && KV_TOKEN) {
                    try {
                        // Busca simultânea do cache de metadados da Steam e da lista de destaques calculados
                        const [cacheRes, destRes] = await Promise.all([
                            fetch(`${KV_URL}/get/steam_metadata_cache`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } }),
                            fetch(`${KV_URL}/get/destaques_home`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } })
                        ]);
                        
                        const cacheData = await cacheRes.json();
                        const destData = await destRes.json();

                        if (cacheData?.result) {
                            steamCache = typeof cacheData.result === 'string' ? JSON.parse(cacheData.result) : cacheData.result;
                        }
                        if (destData?.result) {
                            destaquesHome = typeof destData.result === 'string' ? JSON.parse(destData.result) : destData.result;
                        }

                        // --- LAZY SEEDING INTELIGENTE ---
                        // Popula o cache em background para os primeiros 15 itens caso os dados da Steam estejam desatualizados ou incompletos
                        if (data.items && data.items.length > 0) {
                            const itensParaSeed = data.items.slice(0, 15);
                            let cacheModificado = false;
                            
                            await Promise.allSettled(itensParaSeed.map(async (item) => {
                                const content = item.content?.content || item.summary?.content || '';

                                // Tenta encontrar o Steam App ID direto no link do post
                                let match = content.match(/(?:store\.steampowered\.com|steamcommunity\.com)\/app\/(\d+)/i);
                                let steamId = match ? match[1] : null;

                                // Se for link de bundle da Steam, faz fetch na página do bundle para extrair o ID do primeiro jogo
                                if (!steamId) {
                                    const bundleMatch = content.match(/store\.steampowered\.com\/bundle\/(\d+)/i);
                                    if (bundleMatch) {
                                        const bundleId = bundleMatch[1];
                                        try {
                                            const bundleRes = await fetch(`https://store.steampowered.com/bundle/${bundleId}/`, {
                                                headers: { 
                                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                                                    'Cookie': 'birthtime=283993200; mature_content=1' 
                                                }
                                            });
                                            const bundleHtml = await bundleRes.text();
                                            const innerAppMatch = bundleHtml.match(/\/app\/(\d+)/i);
                                            if (innerAppMatch) steamId = innerAppMatch[1];
                                        } catch (e) {}
                                    }
                                }

                                const cacheAtual = steamCache[steamId];
                                const precisaAtualizar = !cacheAtual || !cacheAtual.movies || !cacheAtual.detailed_description;

                                if (steamId && precisaAtualizar) {
                                    try {
                                        // Consulta dados detalhados na API da Steam e reviews em paralelo
                                        const [detRes, revRes] = await Promise.all([
                                            fetch(`https://store.steampowered.com/api/appdetails?appids=${steamId}&filters=basic,release_date,genres,developers,screenshots,categories,movies,detailed_description,background&l=brazilian&cc=BR`, {
                                                headers: {
                                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                                    'Cookie': 'birthtime=283993200; mature_content=1; lastagecheckage=1-0-1990',
                                                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
                                                }
                                            }),
                                            fetch(`https://store.steampowered.com/appreviews/${steamId}?json=1&filter=all&language=all&day_range=1000&num_per_page=1`)
                                        ]);
                                        
                                        const detJson = await detRes.json();
                                        const revJson = await revRes.json();
                                        const game = detJson[steamId] ?? Object?.values(detJson)[0];

                                        if (game?.success) {
                                            const gData = game.data;
                                            let nota = 0;
                                            let totalReviews = 0;

                                            if (revJson?.success && revJson.query_summary) {
                                                totalReviews = revJson.query_summary.total_reviews || 0;
                                                if (totalReviews > 0) {
                                                    nota = Math.trunc((revJson.query_summary.total_positive * 100) / totalReviews);
                                                }
                                            }

                                            steamCache[steamId] = {
                                                name: gData.name,
                                                header_image: gData.header_image,
                                                background_raw: gData.background_raw || gData.background || '',
                                                detailed_description: gData.detailed_description || '',
                                                short_description: gData.short_description || '',
                                                release_date: gData.release_date,
                                                genres: gData.genres || [],
                                                developers: gData.developers || [],
                                                screenshots: gData.screenshots || [],
                                                categories: gData.categories || [],
                                                movies: gData.movies || [],
                                                rating: nota,
                                                total_reviews: totalReviews,
                                                updated_at: Date.now()
                                            };
                                            cacheModificado = true;
                                        }
                                    } catch (e) {}
                                }
                            }));

                            const precisaLimparExcedentes = Object.keys(steamCache).length > 50;
                            if ((cacheModificado || precisaLimparExcedentes) && Object.keys(steamCache).length > 0) {
                                limparCacheSteam(steamCache, query ? [] : data.items, 50);

                                await fetch(`${KV_URL}/set/steam_metadata_cache`, {
                                    method: 'POST',
                                    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
                                    body: JSON.stringify(steamCache)
                                });
                            }
                        }

                        // --- CÁLCULO DE RESERVA DE DESTAQUES ---
                        // Garante que o carrossel de destaques seja populado com base no algoritmo ponderado de nota e reviews das últimas 24h
                        if (destaquesHome.length === 0 && Object.keys(steamCache).length > 0) {
                            try {
                                const agora = Date.now();
                                const limite24h = 24 * 60 * 60 * 1000;
                                const candidatos = (data.items || []).slice(0, 50).filter(i => (agora - (i.published || 0)) <= limite24h);

                                const listaJogos = [];
                                for (const item of candidatos) {
                                    const content = item.content?.content || item.summary?.content || '';
                                    const match = content.match(/(?:store\.steampowered\.com|steamcommunity\.com)\/app\/(\d+)/i);
                                    const id = match ? match[1] : null;

                                    if (id && steamCache[id]) {
                                        const dados = steamCache[id];
                                        const nota = dados.rating || 0;
                                        const revs = Math.max(dados.total_reviews || 1, 1);
                                        let score = (nota * 0.7) + (Math.log10(revs) * 10 * 0.3);

                                        if (/voices38/i.test(item.title || '')) score += 100000;

                                        listaJogos.push({ 
                                            steamId: id, 
                                            score, 
                                            ...dados,
                                            background_raw: dados.background_raw || dados.background || '',
                                            published: item.published
                                        });
                                    }
                                }

                                listaJogos.sort((a, b) => b.score - a.score);
                                destaquesHome = listaJogos.slice(0, 5);

                                if (destaquesHome.length > 0) {
                                    await fetch(`${KV_URL}/set/destaques_home`, {
                                        method: 'POST',
                                        headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
                                        body: JSON.stringify(destaquesHome)
                                    });
                                }
                            } catch (errDest) {}
                        }

                    } catch (kvErr) {}
                }

                // Enriquece cada post retornado com resolvedSteamId e dados predefinidos de cache
                if (data.items) {
                    data.items = await Promise.all(data.items.map(async (item) => {
                        const content = item.content?.content || item.summary?.content || '';
                        let match = content.match(/(?:store\.steampowered\.com|steamcommunity\.com)\/app\/(\d+)/i);
                        let steamId = match ? match[1] : null;

                        if (!steamId) {
                            const bundleMatch = content.match(/store\.steampowered\.com\/bundle\/(\d+)/i);
                            if (bundleMatch) {
                                const bundleId = bundleMatch[1];
                                try {
                                    const bundleRes = await fetch(`https://store.steampowered.com/bundle/${bundleId}/`, {
                                        headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': 'birthtime=283993200; mature_content=1' }
                                    });
                                    const bundleHtml = await bundleRes.text();
                                    const innerAppMatch = bundleHtml.match(/\/app\/(\d+)/i);
                                    if (innerAppMatch) steamId = innerAppMatch[1];
                                } catch (e) {}
                            }
                        }

                        return {
                            ...item,
                            resolvedSteamId: steamId,
                            steamDetails: (steamId && steamCache[steamId]) ? steamCache[steamId] : null
                        };
                    }));
                }

                return res.status(200).json({
                    ...data,
                    destaques: destaquesHome,
                    fallbackUsado: usandoFallbackFeedly
                });
            }

            case 'list': {
                // Mantido integralmente para contingência caso precise alternar no parâmetro action
                let url = 'https://api.feedly.com/v3/streams/contents?streamId=feed%2Fhttps%3A%2F%2Fwww.skidrowreloaded.com%2Fcategory%2Fpc-games%2Ffeed%2F&count=200&ranked=newest&similar=true&ct=feedly.desktop&cv=31.0.3081';

                if (query) {
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

                    const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
                    const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
                    
                    let steamCache = {};
                    let destaquesHome = [];

                    if (KV_URL && KV_TOKEN) {
                        try {
                            const [cacheRes, destRes] = await Promise.all([
                                fetch(`${KV_URL}/get/steam_metadata_cache`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } }),
                                fetch(`${KV_URL}/get/destaques_home`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } })
                            ]);
                            
                            const cacheData = await cacheRes.json();
                            const destData = await destRes.json();

                            if (cacheData?.result) {
                                steamCache = typeof cacheData.result === 'string' ? JSON.parse(cacheData.result) : cacheData.result;
                            }
                            if (destData?.result) {
                                destaquesHome = typeof destData.result === 'string' ? JSON.parse(destData.result) : destData.result;
                            }

                            if (data.items && data.items.length > 0) {
                                const itensParaSeed = data.items.slice(0, 15);
                                let cacheModificado = false;
                                
                                await Promise.allSettled(itensParaSeed.map(async (item) => {
                                    const content = item.content?.content || item.summary?.content || '';
                                    let match = content.match(/(?:store\.steampowered\.com|steamcommunity\.com)\/app\/(\d+)/i);
                                    let steamId = match ? match[1] : null;

                                    if (!steamId) {
                                        const bundleMatch = content.match(/store\.steampowered\.com\/bundle\/(\d+)/i);
                                        if (bundleMatch) {
                                            const bundleId = bundleMatch[1];
                                            try {
                                                const bundleRes = await fetch(`https://store.steampowered.com/bundle/${bundleId}/`, {
                                                    headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': 'birthtime=283993200; mature_content=1' }
                                                });
                                                const bundleHtml = await bundleRes.text();
                                                const innerAppMatch = bundleHtml.match(/\/app\/(\d+)/i);
                                                if (innerAppMatch) steamId = innerAppMatch[1];
                                            } catch (e) {}
                                        }
                                    }

                                    const cacheAtual = steamCache[steamId];
                                    const precisaAtualizar = !cacheAtual || !cacheAtual.movies || !cacheAtual.detailed_description;

                                    if (steamId && precisaAtualizar) {
                                        try {
                                            const [detRes, revRes] = await Promise.all([
                                                fetch(`https://store.steampowered.com/api/appdetails?appids=${steamId}&filters=basic,release_date,genres,developers,screenshots,categories,movies,detailed_description,background&l=brazilian&cc=BR`, {
                                                    headers: {
                                                        'User-Agent': 'Mozilla/5.0',
                                                        'Cookie': 'birthtime=283993200; mature_content=1; lastagecheckage=1-0-1990',
                                                        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
                                                    }
                                                }),
                                                fetch(`https://store.steampowered.com/appreviews/${steamId}?json=1&filter=all&language=all&day_range=1000&num_per_page=1`)
                                            ]);
                                            
                                            const detJson = await detRes.json();
                                            const revJson = await revRes.json();
                                            const game = detJson[steamId] ?? Object?.values(detJson)[0];

                                            if (game?.success) {
                                                const gData = game.data;
                                                let nota = 0;
                                                let totalReviews = 0;

                                                if (revJson?.success && revJson.query_summary) {
                                                    totalReviews = revJson.query_summary.total_reviews || 0;
                                                    if (totalReviews > 0) {
                                                        nota = Math.trunc((revJson.query_summary.total_positive * 100) / totalReviews);
                                                    }
                                                }

                                                steamCache[steamId] = {
                                                    name: gData.name,
                                                    header_image: gData.header_image,
                                                    background_raw: gData.background_raw || gData.background || '',
                                                    detailed_description: gData.detailed_description || '',
                                                    short_description: gData.short_description || '',
                                                    release_date: gData.release_date,
                                                    genres: gData.genres || [],
                                                    developers: gData.developers || [],
                                                    screenshots: gData.screenshots || [],
                                                    categories: gData.categories || [],
                                                    movies: gData.movies || [],
                                                    rating: nota,
                                                    total_reviews: totalReviews,
                                                    updated_at: Date.now()
                                                };
                                                cacheModificado = true;
                                            }
                                        } catch (e) {}
                                    }
                                }));

                                const precisaLimparExcedentes = Object.keys(steamCache).length > 50;
                                if ((cacheModificado || precisaLimparExcedentes) && Object.keys(steamCache).length > 0) {
                                    limparCacheSteam(steamCache, query ? [] : data.items, 50);

                                    await fetch(`${KV_URL}/set/steam_metadata_cache`, {
                                        method: 'POST',
                                        headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
                                        body: JSON.stringify(steamCache)
                                    });
                                }
                            }

                            if (destaquesHome.length === 0 && Object.keys(steamCache).length > 0) {
                                try {
                                    const agora = Date.now();
                                    const limite24h = 24 * 60 * 60 * 1000;
                                    const candidatos = (data.items || []).slice(0, 50).filter(i => (agora - (i.published || 0)) <= limite24h);

                                    const listaJogos = [];
                                    for (const item of candidatos) {
                                        const content = item.content?.content || item.summary?.content || '';
                                        const match = content.match(/(?:store\.steampowered\.com|steamcommunity\.com)\/app\/(\d+)/i);
                                        const id = match ? match[1] : null;

                                        if (id && steamCache[id]) {
                                            const dados = steamCache[id];
                                            const nota = dados.rating || 0;
                                            const revs = Math.max(dados.total_reviews || 1, 1);
                                            let score = (nota * 0.7) + (Math.log10(revs) * 10 * 0.3);

                                            if (/voices38/i.test(item.title || '')) score += 100000;

                                            listaJogos.push({ 
                                                steamId: id, 
                                                score, 
                                                ...dados,
                                                background_raw: dados.background_raw || dados.background || '',
                                                published: item.published
                                            });
                                        }
                                    }

                                    listaJogos.sort((a, b) => b.score - a.score);
                                    destaquesHome = listaJogos.slice(0, 5);

                                    if (destaquesHome.length > 0) {
                                        await fetch(`${KV_URL}/set/destaques_home`, {
                                            method: 'POST',
                                            headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
                                            body: JSON.stringify(destaquesHome)
                                        });
                                    }
                                } catch (errDest) {}
                            }

                        } catch (kvErr) {}
                    }

                    if (data.items) {
                        data.items = await Promise.all(data.items.map(async (item) => {
                            const content = item.content?.content || item.summary?.content || '';
                            let match = content.match(/(?:store\.steampowered\.com|steamcommunity\.com)\/app\/(\d+)/i);
                            let steamId = match ? match[1] : null;

                            if (!steamId) {
                                const bundleMatch = content.match(/store\.steampowered\.com\/bundle\/(\d+)/i);
                                if (bundleMatch) {
                                    const bundleId = bundleMatch[1];
                                    try {
                                        const bundleRes = await fetch(`https://store.steampowered.com/bundle/${bundleId}/`, {
                                            headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': 'birthtime=283993200; mature_content=1' }
                                        });
                                        const bundleHtml = await bundleRes.text();
                                        const innerAppMatch = bundleHtml.match(/\/app\/(\d+)/i);
                                        if (innerAppMatch) steamId = innerAppMatch[1];
                                    } catch (e) {}
                                }
                            }

                            return {
                                ...item,
                                resolvedSteamId: steamId,
                                steamDetails: (steamId && steamCache[steamId]) ? steamCache[steamId] : null
                            };
                        }));
                    }
                    
                    return res.status(200).json({
                        ...data,
                        destaques: destaquesHome
                    });
                } catch (error) {
                    return res.status(500).json({ error: 'Falha ao buscar feedly' });
                }
            }

            case 'entry': {
                if (!id) {
                    return res.status(400).json({ error: 'ID é obrigatório' });
                }

                // Tenta buscar no WordPress se for ID numérico da API nativa
                if (/^\d+$/.test(id)) {
                    try {
                        const wpRes = await fetch(`https://www.skidrowreloaded.com/wp-json/wp/v2/posts/${id}?_embed&_fields=id,date,date_gmt,link,title,content,excerpt,_links,_embedded`, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                                'Accept': 'application/json, text/plain, */*',
                                'Referer': 'https://www.skidrowreloaded.com/'
                            }
                        });
                        if (wpRes.ok) {
                            const post = await wpRes.json();
                            const featuredMedia = post._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';
                            return res.status(200).json({
                                id: String(post.id),
                                title: decodeHTMLEntities(post.title?.rendered || post.title || ''),
                                published: new Date(post.date_gmt ? (post.date_gmt.endsWith('Z') ? post.date_gmt : post.date_gmt + 'Z') : post.date).getTime(),
                                content: { content: post.content?.rendered || '' },
                                summary: { content: post.excerpt?.rendered || '' },
                                alternate: [{ href: post.link || '' }],
                                visual: featuredMedia ? { url: featuredMedia } : undefined
                            });
                        }
                    } catch (e) {}
                }

                // Fallback Feedly para IDs no formato antigo de RSS
                try {
                    const response = await fetch(`https://api.feedly.com/v3/entries/${encodeURIComponent(id)}`);
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
                    return res.status(500).json({ error: 'Falha ao buscar item' });
                }
            }

            default:
                return res.status(400).json({ error: 'Ação inválida.' });
        }
    } catch (error) {
        return res.status(500).json({ error: 'Erro interno no servidor.' });
    }
}

// Utilitário para decodificar entidades HTML no servidor Node.js
function decodeHTMLEntities(text) {
    if (!text) return '';
    return text
        .replace(/&#8211;/g, '–')
        .replace(/&#8212;/g, '—')
        .replace(/&#8216;/g, '‘')
        .replace(/&#8217;/g, '’')
        .replace(/&#8220;/g, '“')
        .replace(/&#8221;/g, '”')
        .replace(/&#038;/g, '&')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
}

// Mantém o tamanho do cache da Steam controlado no Upstash Redis
function limparCacheSteam(cache, feedItems, maxLimite = 50) {
    if (!cache || typeof cache !== 'object') return;

    const chaves = Object.keys(cache);
    if (chaves.length <= maxLimite) return;

    const topSteamIds = new Set();
    if (Array.isArray(feedItems) && feedItems.length > 0) {
        for (const item of feedItems.slice(0, maxLimite)) {
            const content = item.content?.content || item.summary?.content || '';
            const match = content.match(/(?:store\.steampowered\.com|steamcommunity\.com)\/app\/(\d+)/i);
            if (match) topSteamIds.add(match[1]);
        }
    }

    chaves.sort((a, b) => (cache[b]?.updated_at || 0) - (cache[a]?.updated_at || 0));

    for (let i = chaves.length - 1; i >= 0; i--) {
        const id = chaves[i];
        if (Object.keys(cache).length <= maxLimite) break;
        if (!topSteamIds.has(id)) {
            delete cache[id];
        }
    }
}