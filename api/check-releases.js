import webpush from 'web-push';

export default async function handler(req, res) {
    // 1. Barreira de Segurança: Só permite execução se o segredo da URL estiver correto
    const secretParam = req.query?.secret || req.headers?.authorization?.replace('Bearer ', '');
    if (secretParam !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Acesso não autorizado. Chave de cron incorreta.' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'KV não configurado.' });
    }

    // Configura as chaves no módulo web-push
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );

    try {
        // Domínio base absoluto para garantir URLs válidas nas notificações mobile
        const DOMAIN_URL = 'https://tracker-steam.vercel.app';

        // 2. Busca o timestamp da última checagem no Vercel KV
        const getCronTimeRes = await fetch(`${KV_REST_API_URL}/get/last_checked_cron`, {
            headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
        });
        const getCronTimeData = await getCronTimeRes.json();
        
        // Se for a primeira execução da vida, assume 15 minutos atrás para não fludar os usuários com 200 alertas
        let lastChecked = getCronTimeData?.result ? parseInt(getCronTimeData.result, 10) : (Date.now() - 15 * 60 * 1000);

        // 3. Busca o feed RSS/JSON atualizado do Skidrow no Feedly (mesmo endpoint usado no seu app)
        const feedUrl = 'https://api.feedly.com/v3/streams/contents?streamId=feed%2Fhttps%3A%2F%2Fwww.skidrowreloaded.com%2Fcategory%2Fpc-games%2Ffeed%2F&count=20&ranked=newest&ct=feedly.desktop&cv=31.0.3081';
        const feedRes = await fetch(feedUrl);
        const feedData = await feedRes.json();

        const items = feedData.items || [];
        
        // Parâmetros opcionais para teste manual cirúrgico
        const forcarTesteManual = req.query?.forcar_teste === 'true';
        const feedlyIdForcado = req.query?.feedlyId || req.query?.id;
        const tokenAlvo = req.query?.token;

        let novosItens = [];
        if (forcarTesteManual) {
            if (feedlyIdForcado) {
                const encontrado = items.find(i => i.id === feedlyIdForcado);
                if (encontrado) novosItens = [encontrado];
            }
            if (novosItens.length === 0 && items.length > 0) {
                novosItens = [items[0]]; // Fallback: pega o primeiro jogo atual do feed se não achar o ID exato
            }
        } else {
            // Filtra apenas os jogos publicados APÓS a última checagem
            novosItens = items.filter(item => (item.published || 0) > lastChecked);
        }

        if (novosItens.length === 0) {
            return res.status(200).json({ message: 'Nenhum release novo desde a última verificação.', checked: novosItens.length });
        }

        // 4. Busca todos os dispositivos inscritos no banco
        const getSubsRes = await fetch(`${KV_REST_API_URL}/get/push_subscriptions`, {
            headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
        });
        const getSubsData = await getSubsRes.json();
        let subscriptions = [];
        if (getSubsData && getSubsData.result) {
            subscriptions = typeof getSubsData.result === 'string' ? JSON.parse(getSubsData.result) : getSubsData.result;
        }

        // Se for teste manual e informou token, tenta filtrar, mas usa fallback se o token não estiver gravado
        /* if (forcarTesteManual && tokenAlvo) {
            const filtrados = subscriptions.filter(sub => sub.userToken === tokenAlvo);
            if (filtrados.length > 0) {
                subscriptions = filtrados;
            }
        } */

        if (subscriptions.length === 0) {
            return res.status(200).json({ message: 'Há novos jogos, mas nenhum usuário inscrito para receber push.', newItems: novosItens.length });
        }

        let disparosDeletados = false;

        // =================================================================
        // --- INÍCIO: CARREGAMENTO DO CACHE STEAM NO KV ---
        // =================================================================
        let steamCache = {};
        try {
            const getCacheRes = await fetch(`${KV_REST_API_URL}/get/steam_metadata_cache`, {
                headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
            });
            const getCacheData = await getCacheRes.json();
            if (getCacheData && getCacheData.result) {
                steamCache = typeof getCacheData.result === 'string' ? JSON.parse(getCacheData.result) : getCacheData.result;
            }
        } catch (e) {
            console.error('Erro ao ler cache Steam do KV no cron:', e);
        }
        let cacheAtualizado = false;
        // =================================================================
        // --- FIM: CARREGAMENTO DO CACHE STEAM NO KV ---
        // =================================================================

        // 5. Para cada jogo novo, processa a capa (tentando a horizontal da Steam) e envia o alerta
        for (const item of novosItens) {
            const htmlContent = item.content?.content || item.summary?.content || '';
            const textContent = item.summary?.content || htmlContent;

            // Extrai o Steam ID do post (mesma regex do frontend)
            const steamMatch = htmlContent.match(/(?:store\.steampowered\.com|steamcommunity\.com)\/app\/(\d+)/i) 
                            || textContent.match(/(?:store\.steampowered\.com|steamcommunity\.com)\/app\/(\d+)/i);
            const steamId = steamMatch ? steamMatch[1] : null;

            let steamHeaderImg = '';
            
            // =================================================================
            // --- INÍCIO: ENRIQUECIMENTO COMPLETO & AVALIAÇÕES STEAM ---
            // =================================================================
            if (steamId) {
                try {
                    // Busca os detalhes do jogo (incluindo background) e também a quantidade de avaliações em paralelo
                    const [steamRes, revRes] = await Promise.all([
                        fetch(`https://store.steampowered.com/api/appdetails?appids=${steamId}&filters=basic,release_date,genres,developers,screenshots,categories,movies,background`),
                        fetch(`https://store.steampowered.com/appreviews/${steamId}?json=1&filter=all&language=all&day_range=1000&num_per_page=1`)
                    ]);

                    const steamJson = await steamRes.json();
                    const revJson = await revRes.json();

                    if (steamJson[steamId]?.success && steamJson[steamId]?.data) {
                        const gData = steamJson[steamId].data;
                        if (gData.header_image) {
                            steamHeaderImg = gData.header_image;
                        }

                        // Cálculo da Nota e extração do Total de Avaliações
                        let nota = 0;
                        let totalReviews = 0;
                        if (revJson && revJson.success && revJson.query_summary) {
                            totalReviews = revJson.query_summary.total_reviews || 0;
                            if (totalReviews > 0) {
                                nota = Math.trunc((revJson.query_summary.total_positive * 100) / totalReviews);
                            }
                        }

                        // Salva/Atualiza no objeto do cache em memória com todos os dados para o Modal Instantâneo
                        steamCache[steamId] = {
                            name: gData.name,
                            header_image: gData.header_image,
                            background_raw: gData.background_raw || gData.background || `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamId}/page_bg_raw.jpg`,
                            release_date: gData.release_date,
                            genres: gData.genres || [],
                            developers: gData.developers || [],
                            screenshots: gData.screenshots || [],
                            categories: gData.categories || [],
                            movies: gData.movies || [],
                            short_description: gData.short_description || '',
                            rating: nota,
                            total_reviews: totalReviews,
                            updated_at: Date.now()
                        };
                        cacheAtualizado = true;
                    }
                } catch (e) {
                    console.log('Não foi possível buscar dados completos da Steam no cron, usando fallback.', e);
                }
            }
            // =================================================================
            // --- FIM: ENRIQUECIMENTO COMPLETO & AVALIAÇÕES STEAM ---
            // =================================================================

            // Se não achou o header na Steam, faz o fallback para a capa vertical antiga extraída do Feedly
            let rawImg = steamHeaderImg;
            if (!rawImg) {
                const imgMatches = [...htmlContent.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];
                let capaValida = '';
                for (const match of imgMatches) {
                    const src = match[1].toLowerCase();
                    if (!src.includes('logo') && !src.includes('theme') && !src.includes('header') && !src.includes('avatar') && !src.includes('steamstatic')) {
                        capaValida = match[1];
                        break;
                    }
                }
                rawImg = capaValida || item.visual?.url || '';
            }

            // Encapsula no cover-proxy do seu domínio para evitar problemas de CORS/Rede no Android
            let imgFinal = `${DOMAIN_URL}/assets/logo2.png`;
            if (rawImg && rawImg.startsWith('http')) {
                imgFinal = `${DOMAIN_URL}/api/cover-proxy?url=${encodeURIComponent(rawImg)}`;
            } else if (rawImg.startsWith('/')) {
                imgFinal = `${DOMAIN_URL}${rawImg}`;
            }

            // Limpa o título (pega o nome base antes do hífen do release)
            const indexHifen = item.title.lastIndexOf('-');
            const tituloLimpo = indexHifen !== -1 ? item.title.slice(0, indexHifen).trim() : item.title.trim();

            const payload = JSON.stringify({
                title: tituloLimpo,
                body: `Release: ${item.title}`,
                cover: imgFinal,
                url: `${DOMAIN_URL}/?id=${encodeURIComponent(item.id)}` // <-- URL com o ID exato para o deep link
            });

            // Dispara para todas as inscrições em paralelo
            await Promise.allSettled(subscriptions.map(async (sub) => {
                try {
                    await webpush.sendNotification(sub, payload);
                } catch (err) {
                    // Se o celular do usuário não existe mais (404/410), marca para remover do nosso Vercel KV
                    if (err.statusCode === 404 || err.statusCode === 410) {
                        subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
                        disparosDeletados = true;
                    }
                }
            }));
        }

        // 6. Se houveram inscrições expiradas (dispositivos antigos), atualiza o KV para economizar memória
        if (disparosDeletados) {
            await fetch(`${KV_REST_API_URL}/set/push_subscriptions`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(subscriptions)
            });
        }

        // =================================================================
        // --- INÍCIO: SALVAR CACHE E CALCULAR DESTAQUES NO KV ---
        // =================================================================
        if (cacheAtualizado) {
            try {
                // 1. Salva o cache geral da Steam atualizado
                await fetch(`${KV_REST_API_URL}/set/steam_metadata_cache`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(steamCache)
                });

                // 2. Calcula os Top 5 Destaques baseado no nosso algoritmo de pesos
                // Score = (Nota * 0.7) + (log10(TotalReviews) * 10 * 0.3)
                const listaJogos = Object.entries(steamCache).map(([id, dados]) => {
                    const nota = dados.rating || 0;
                    const revs = Math.max(dados.total_reviews || 1, 1);
                    // Adicionamos multiplicador 10 no log10 para equilibrar com a escala de nota 0 a 100
                    const score = (nota * 0.7) + (Math.log10(revs) * 10 * 0.3);
                    return { steamId: id, score, ...dados };
                });

                // Ordena pelos maiores scores e pega os 5 primeiros
                listaJogos.sort((a, b) => b.score - a.score);
                const top5Destaques = listaJogos.slice(0, 5);

                // 3. Salva a lista de destaques pronta para o Frontend consumir em uma requisição única
                await fetch(`${KV_REST_API_URL}/set/destaques_home`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(top5Destaques)
                });
            } catch (errKv) {
                console.error("Erro ao salvar cache e destaques no KV:", errKv);
            }
        }
        // =================================================================
        // --- FIM: SALVAR CACHE E CALCULAR DESTAQUES NO KV ---
        // =================================================================

        // 7. Salva o timestamp do item mais recente como o novo last_checked_cron
        if (!forcarTesteManual) {
            const maiorTimestamp = Math.max(...novosItens.map(i => i.published || 0));
            await fetch(`${KV_REST_API_URL}/set/last_checked_cron`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(maiorTimestamp)
            });
        }

        return res.status(200).json({ 
            success: true, 
            modoTesteManual: forcarTesteManual,
            jogoTestado: novosItens[0]?.title || null,
            novosJogosNotificados: novosItens.length,
            dispositivosAtendidos: subscriptions.length 
        });

    } catch (error) {
        console.error('Erro na verificação de cron:', error);
        return res.status(500).json({ error: 'Erro interno ao processar cron job.' });
    }
}