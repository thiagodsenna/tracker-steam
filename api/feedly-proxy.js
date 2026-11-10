// Exporta a função para ser chamada diretamente em memória pelo check-releases.js sem requisições HTTP internas
export async function obterPostsSkidrow(query = '') {
    // Configurações de headers para simular navegador real
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    };

    // VARIÁVEL DE CONTROLE DE PAGINAÇÃO:
    // Altere este valor para controlar quantas páginas da listagem serão raspadas em paralelo.
    // Exemplo: 5 raspas a página 1 (principal) + páginas 2, 3, 4 e 5.
    const TOTAL_PAGINAS = 5;

    const isSearch = Boolean(query);
    const queryClean = isSearch ? encodeURIComponent(query.replace(/['‘’]/g, '')) : '';
    const pageUrls = [];

    for (let p = 1; p <= TOTAL_PAGINAS; p++) {
        if (isSearch) {
            pageUrls.push(p === 1 
                ? `https://www.skidrowreloaded.com/?s=${queryClean}` 
                : `https://www.skidrowreloaded.com/page/${p}/?s=${queryClean}`
            );
        } else {
            pageUrls.push(p === 1 
                ? 'https://www.skidrowreloaded.com/category/pc-games/' 
                : `https://www.skidrowreloaded.com/category/pc-games/page/${p}/`
            );
        }
    }

    let items = [];

    try {
        // Busca todas as páginas da listagem em paralelo para otimizar o tempo de resposta
        const pagesResponses = await Promise.all(
            pageUrls.map(url => fetch(url, { headers }).catch(err => {
                console.error(`[Scraper List Error] Falha na página ${url}:`, err);
                return null;
            }))
        );

        const postLinks = [];
        const seenUrls = new Set();

        // Processa o HTML de todas as páginas capturadas
        for (const resPage of pagesResponses) {
            if (!resPage || !resPage.ok) continue;
            const html = await resPage.text();

            const matchesPosts = [...html.matchAll(/<h2>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?Posted\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/gi)];
            
            for (const m of matchesPosts) {
                const url = m[1];
                if (!seenUrls.has(url)) {
                    seenUrls.add(url);
                    postLinks.push({
                        url: url,
                        titleFallback: m[2].trim(),
                        dateFallback: m[3].trim()
                    });
                }
            }

            // Fallback de regex simplificada caso a data não venha na estrutura padrão
            if (matchesPosts.length === 0) {
                const matchesSimple = [...html.matchAll(/<h2>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi)];
                for (const m of matchesSimple) {
                    const url = m[1];
                    if (!seenUrls.has(url)) {
                        seenUrls.add(url);
                        postLinks.push({
                            url: url,
                            titleFallback: m[2].trim(),
                            dateFallback: new Date().toUTCString()
                        });
                    }
                }
            }
        }

        // Busca os detalhes das páginas individuais dos posts em paralelo
        const postsDetailed = await Promise.all(
            postLinks.map(async ({ url, titleFallback, dateFallback }) => {
                try {
                    const detailRes = await fetch(url, { headers });
                    if (!detailRes.ok) return null;
                    const detailHtml = await detailRes.text();

                    // Limpeza do título do jogo
                    const titleMatch = detailHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
                    let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : titleFallback;

                    title = title
                        .replace(/&#\d+;|&[a-z]+;/gi, ' ')
                        .replace(/[-–—]\s*(?:Skidrow|Reloaded|Games|Scene|PC|FREE|DOWNLOAD).*/i, '')
                        .replace(/Skidrow\s*&?\s*Reloaded\s*Games.*/i, '')
                        .replace(/\s+/g, ' ')
                        .trim();

                    if (!title) {
                        title = titleFallback.replace(/&#\d+;|&[a-z]+;/gi, ' ').trim();
                    }

                    const dateMatch = detailHtml.match(/Posted\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
                    const publishedStr = dateMatch ? dateMatch[1].trim() : dateFallback;
                    const publishedTimestamp = new Date(publishedStr).getTime() || Date.now();

                    // Extração precisa do container de conteúdo do post para evitar o envio do HTML completo da página na listagem
                    let contentHtml = '';
                    const contentMatch = detailHtml.match(/<div[^>]*class="[^"]*(?:post-content|entry-content|entry)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<(?:div|footer|section)[^>]*class="[^"]*(?:post-footer|share|comments|related|tags)[^"]*"/i)
                                      || detailHtml.match(/<div[^>]*class="[^"]*(?:post-content|entry-content|entry)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

                    if (contentMatch) {
                        contentHtml = contentMatch[1].trim();
                    } else {
                        const contentStart = detailHtml.search(/class="(?:post|entry)-content|post-excerpt/i);
                        contentHtml = contentStart !== -1 ? detailHtml.slice(contentStart, contentStart + 3500) : detailHtml.slice(0, 3500);
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
                        id: url,
                        title: title,
                        published: publishedTimestamp,
                        content: { content: contentHtml },
                        summary: { content: contentHtml.slice(0, 300) },
                        alternate: [{ href: url }],
                        visual: imgUrl ? { url: imgUrl } : undefined
                    };
                } catch (e) {
                    console.error(`[Scraper Post Error] Erro ao processar ${url}:`, e);
                    return null;
                }
            })
        );

        items = postsDetailed.filter(p => p !== null);

    } catch (scrapErr) {
        console.error('[Scraper Main Error]:', scrapErr);
        return { items: [] };
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
                            } catch (e) {
                                console.error(`[Steam Bundle Error] Falha ao resolver AppID no bundle ${bundleId}:`, e);
                            }
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
                        } catch (e) {
                            console.error(`[Steam Fetch Error] Falha ao atualizar dados do app ${steamId}:`, e);
                        }
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
                } catch (errDest) {
                    console.error('[Destaques Home Error] Falha ao calcular destaques:', errDest);
                }
            }

        } catch (kvErr) {
            console.error('[Upstash Redis KV Error] Falha na comunicação com o KV:', kvErr);
        }
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
                    } catch (e) {
                        console.error(`[Steam Item Bundle Error] AppID bundle ${bundleId}:`, e);
                    }
                }
            }

            return {
                ...item,
                resolvedSteamId: steamId,
                steamDetails: (steamId && steamCache[steamId]) ? steamCache[steamId] : null
            };
        }));
    }

    return {
        ...data,
        destaques: destaquesHome
    };
}

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
                const data = await obterPostsSkidrow(query);
                return res.status(200).json(data);
            }

            case 'list': {
                // Mantido integralmente para contingência caso precise alternar no parâmetro action
                let url = 'https://api.feedly.com/v3/streams/contents?streamId=feed%2Fhttps%3A%2F%2Fwww.skidrowreloaded.com%2Fcategory%2Fpc-games%2Ffeed%2F&count=200&ranked=newest&similar=true&ct=feedly.desktop&cv=31.0.3081';

                if (query) {
                  url = 'https://api.feedly.com/v3/streams/contents?streamId=feed%2Fhttps%3A%2F%2Fwww.skidrowreloaded.com%2Fcategory%2Fpc-games%2Ffeed%2F&count=1000&ranked=newest&ct=feedly.desktop&cv=31.0.3081';
                }

                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        const errText = await response.text();
                        console.error(`[Feedly List Error] HTTP ${response.status} ${response.statusText} | Body: ${errText.slice(0, 500)}`);
                        return res.status(response.status).json({ error: 'Falha ao buscar feedly' });
                    }
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
                                            } catch (e) {
                                                console.error(`[List Steam Bundle Error] AppID bundle ${bundleId}:`, e);
                                            }
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
                                        } catch (e) {
                                            console.error(`[List Steam Fetch Error] AppID ${steamId}:`, e);
                                        }
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
                                } catch (errDest) {
                                    console.error('[List Destaques Error]:', errDest);
                                }
                            }

                        } catch (kvErr) {
                            console.error('[List KV Error]:', kvErr);
                        }
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
                                    } catch (e) {
                                        console.error(`[List Item Steam Bundle Error] AppID bundle ${bundleId}:`, e);
                                    }
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
                    console.error('[List Action Exception]:', error);
                    return res.status(500).json({ error: 'Falha ao buscar feedly' });
                }
            }

            case 'entry': {
                if (!id) {
                    return res.status(400).json({ error: 'ID é obrigatório' });
                }

                // Tenta buscar os detalhes diretamente da URL do post se for um link HTTP do Skidrow (Sem truncamento de caracteres)
                if (id.startsWith('http')) {
                    try {
                        const headers = {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        };
                        const detailRes = await fetch(id, { headers });
                        if (detailRes.ok) {
                            const detailHtml = await detailRes.text();
                            const titleMatch = detailHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
                            let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

                            const dateMatch = detailHtml.match(/Posted\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
                            const publishedStr = dateMatch ? dateMatch[1].trim() : '';
                            const publishedTimestamp = publishedStr ? new Date(publishedStr).getTime() : Date.now();

                            let contentHtml = '';
                            const contentMatch = detailHtml.match(/<div[^>]*class="[^"]*(?:post-content|entry-content|entry)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<(?:div|footer|section)[^>]*class="[^"]*(?:post-footer|share|comments|related|tags)[^"]*"/i)
                                              || detailHtml.match(/<div[^>]*class="[^"]*(?:post-content|entry-content|entry)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

                            if (contentMatch) {
                                contentHtml = contentMatch[1].trim();
                            } else {
                                const contentStart = detailHtml.search(/class="(?:post|entry)-content|post-excerpt/i);
                                contentHtml = contentStart !== -1 ? detailHtml.slice(contentStart) : detailHtml;
                            }

                            return res.status(200).json({
                                id: id,
                                title: title,
                                published: publishedTimestamp,
                                content: { content: contentHtml },
                                summary: { content: contentHtml.slice(0, 500) },
                                alternate: [{ href: id }]
                            });
                        }
                    } catch (e) {
                        console.error(`[Entry Scraper Exception] ID ${id}:`, e);
                    }
                }

                // Fallback Feedly para IDs no formato antigo de RSS
                try {
                    const response = await fetch(`https://api.feedly.com/v3/entries/${encodeURIComponent(id)}`);
                    if (!response.ok) {
                        const errBody = await response.text();
                        console.error(`[Entry Feedly Error] ID ${id} HTTP ${response.status} ${response.statusText} | Body Preview: ${errBody.slice(0, 300)}`);
                        return res.status(response.status).json({ error: 'Item não encontrado no Feedly' });
                    }

                    const data = await response.json();
                    const item = Array.isArray(data) ? data[0] : data;

                    if (!item?.id) {
                        return res.status(404).json({ error: 'Item não encontrado no Feedly' });
                    }

                    return res.status(200).json(item);
                } catch (error) {
                    console.error(`[Entry Action Exception] ID ${id}:`, error);
                    return res.status(500).json({ error: 'Falha ao buscar item' });
                }
            }

            default:
                return res.status(400).json({ error: 'Ação inválida.' });
        }
    } catch (error) {
        console.error('[Handler General Exception]:', error);
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