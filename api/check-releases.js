import webpush from 'web-push';
import { obterPostsSkidrow } from './feedly-proxy.js';

export default async function handler(req, res) {
    const secretParam = req.query?.secret || req.headers?.authorization?.replace('Bearer ', '');
    if (secretParam !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Acesso não autorizado. Chave de cron incorreta.' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'KV não configurado.' });
    }

    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );

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

    function formatarDataRelativa(dataString) {
        if (!dataString) return '';

        let dataPost;
        let dataStringBR;
        const str = String(dataString).trim();
        const capitalize = ([first, ...rest]) => first ? first.toUpperCase() + rest.join('') : '';

        const mesesMap = {
            'jan': 0, 'feb': 1, 'fev': 1, 'mar': 2, 'apr': 3, 'abr': 3,
            'may': 4, 'mai': 4, 'jun': 5, 'jul': 6, 'aug': 7, 'ago': 7,
            'sep': 8, 'set': 8, 'oct': 9, 'out': 9, 'nov': 10, 'dec': 11, 'dez': 11
        };

        const matchBR = str.match(/^(\d{1,2})\/([a-zA-Z]{3})\.?\/(\d{4})$/i);
        const matchEN = str.match(/^([a-zA-Z]{3})\s(\d{1,2}),\s(\d{4})$/i);

        if (matchBR) {
            const dia = parseInt(matchBR[1], 10);
            const mesStr = matchBR[2].toLowerCase();
            const ano = parseInt(matchBR[3], 10);
            const mes = mesesMap[mesStr] !== undefined ? mesesMap[mesStr] : 0;
            dataStringBR = `${capitalize(mesStr)} ${dia}, ${ano}`;
            dataPost = new Date(ano, mes, dia);
        } else if (matchEN) {
            const mesStr = matchEN[1].toLowerCase();
            const dia = parseInt(matchEN[2], 10);
            const ano = parseInt(matchEN[3], 10);
            const mes = mesesMap[mesStr] !== undefined ? mesesMap[mesStr] : 0;
            dataPost = new Date(ano, mes, dia);
        } else {
            dataPost = new Date(dataString);
        }

        if (isNaN(dataPost.getTime())) return dataString;

        const hoje = new Date();
        const d1 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
        const d2 = new Date(dataPost.getFullYear(), dataPost.getMonth(), dataPost.getDate());
        const diffTempo = d1 - d2;
        const diffDias = Math.floor(diffTempo / (1000 * 60 * 60 * 24));
        
        if (diffDias === 0) return 'Hoje';
        if (diffDias === 1) return 'Ontem';
        if (diffDias === -1) return 'Amanhã';
        if (diffDias < -1 && diffDias >= -30) return `Em ${Math.abs(diffDias)} dias`;
        if (diffDias < 30) return `Há ${diffDias} dias`;
        
        const diffMeses = Math.floor(diffDias / 30);
        if (diffMeses <= -1) return `Em ${Math.abs(diffMeses)} ${diffMeses === -1 ? 'mês' : 'meses'}`;
        if (diffMeses < 12) return `Há ${diffMeses} ${diffMeses === 1 ? 'mês' : 'meses'}`;

        if (matchBR && dataStringBR) return dataStringBR;
        return dataString;
    }

    async function resolverSteamId(contentText) {
        if (!contentText) return null;
        let match = contentText.match(/(?:store\.steampowered\.com|steamcommunity\.com)\/app\/(\d+)/i);
        if (match) return match[1];

        const bundleMatch = contentText.match(/store\.steampowered\.com\/bundle\/(\d+)/i);
        if (bundleMatch) {
            const bundleId = bundleMatch[1];
            try {
                const res = await fetch(`https://store.steampowered.com/bundle/${bundleId}/`, {
                    headers: { 
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                        'Cookie': 'birthtime=283993200; mature_content=1' 
                    }
                });
                const html = await res.text();
                const innerMatch = html.match(/\/app\/(\d+)/i);
                if (innerMatch) return innerMatch[1];
            } catch (err) {}
        }
        return null;
    }

    async function obterReviewsSeguro(appId) {
        if (!appId) return { success: false };
        const inputJson = {
            appid: parseInt(appId),
            filter: 0,
            languages: ["all"],
            day_range: 1000,
            num_per_page: 1
        };
        const apiUrl = `https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?input_json=${encodeURIComponent(JSON.stringify(inputJson))}`;
        
        try {
            const res = await fetch(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Cookie': 'birthtime=283993200; mature_content=1; lastagecheckage=1-0-1990'
                }
            });
            const text = await res.text();
            try {
                const data = JSON.parse(text);
                let result = data.response || data;
                result.success = true; 
                return result;
            } catch (e) {
                return { success: false, query_summary: { total_reviews: 0, total_positive: 0 } };
            }
        } catch (error) {
            return { success: false, query_summary: { total_reviews: 0, total_positive: 0 } };
        }
    }

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

    try {
        // Fixado domínio de produção público para evitar links de preview Vercel protegidos por login (SSO)
        const DOMAIN_URL = 'https://tracker-steam.vercel.app';

        // 1. Resgata a timestamp da última verificação da cron
        const getCronTimeRes = await fetch(`${KV_REST_API_URL}/get/last_checked_cron`, {
            headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
        });
        const getCronTimeData = await getCronTimeRes.json();
        
        let lastChecked = 0;
        if (getCronTimeData?.result) {
            const parsed = parseInt(getCronTimeData.result, 10);
            if (!isNaN(parsed) && isFinite(parsed) && parsed > 0) {
                lastChecked = parsed;
            }
        }

        if (!lastChecked) {
            lastChecked = Date.now() - (2 * 60 * 60 * 1000);
        }

        // 2. Obtém os posts do Skidrow direto em memória
        const feedData = await obterPostsSkidrow();
        const items = feedData.items || [];

        // 3. Filtra apenas os lançamentos mais recentes que o lastChecked
        const forcarTesteManual = req.query?.forcar_teste === 'true';
        const feedlyIdForcado = req.query?.feedlyId || req.query?.id;

        let novosItens = [];
        if (forcarTesteManual) {
            if (feedlyIdForcado) {
                const encontrado = items.find(i => i.id === feedlyIdForcado || (i.id && i.id.includes(feedlyIdForcado)));
                if (encontrado) novosItens = [encontrado];
            }
            if (novosItens.length === 0 && items.length > 0) {
                novosItens = [items[0]];
            }
        } else {
            novosItens = items.filter(item => (item.published || 0) > lastChecked);
        }

        // 4. Carrega o cache atual da Steam do Vercel KV
        let steamCache = {};
        try {
            const getCacheRes = await fetch(`${KV_REST_API_URL}/get/steam_metadata_cache`, {
                headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
            });
            const getCacheData = await getCacheRes.json();
            if (getCacheData?.result) {
                steamCache = typeof getCacheData.result === 'string' ? JSON.parse(getCacheData.result) : getCacheData.result;
            }
        } catch (e) {}
        let cacheAtualizado = false;

        // 5. Smart Refresh de Cache
        const candidatosHome = items.slice(0, 50);
        const agora = Date.now();
        const filaParaAtualizar = [];

        for (const item of candidatosHome) {
            const htmlContent = item.content?.content || item.summary?.content || '';
            const textContent = item.summary?.content || htmlContent;
            const steamId = item.resolvedSteamId || await resolverSteamId(htmlContent + ' ' + textContent);

            if (steamId) {
                const dados = steamCache[steamId] || {};
                const ultimaAtualizacao = dados.updated_at || 0;
                const tempoDesdeAtualizacao = agora - ultimaAtualizacao;
                const totalReviews = dados.total_reviews || 0;
                const idadeRelease = agora - (item.published || 0);

                let cooldownNecessario = 24 * 60 * 60 * 1000;
                if (totalReviews < 100 || idadeRelease <= (48 * 60 * 60 * 1000)) {
                    cooldownNecessario = 30 * 60 * 1000;
                } else if (totalReviews < 1000 || idadeRelease <= (7 * 24 * 60 * 60 * 1000)) {
                    cooldownNecessario = 3 * 60 * 60 * 1000;
                }

                if (!steamCache[steamId] || tempoDesdeAtualizacao >= cooldownNecessario) {
                    filaParaAtualizar.push({ 
                        steamId, 
                        tempoDesdeAtualizacao: !steamCache[steamId] ? Infinity : tempoDesdeAtualizacao 
                    });
                }
            }
        }

        filaParaAtualizar.sort((a, b) => b.tempoDesdeAtualizacao - a.tempoDesdeAtualizacao);
        const loteAtualizacao = filaParaAtualizar.slice(0, 10);

        if (loteAtualizacao.length > 0) {
            for (const alvo of loteAtualizacao) {
                try {
                    const [steamRes, revJson] = await Promise.all([
                        fetch(`https://store.steampowered.com/api/appdetails?appids=${alvo.steamId}&filters=basic,release_date,genres,developers,screenshots,categories,movies,background&l=brazilian&cc=BR`, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0',
                                'Cookie': 'birthtime=283993200; mature_content=1; lastagecheckage=1-0-1990',
                                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
                            }
                        }),
                        obterReviewsSeguro(alvo.steamId)
                    ]);

                    const steamJson = await steamRes.json();
                    const game = Object?.values(steamJson)[0];

                    if (game?.success && game?.data) {
                        const gData = game.data;
                        let notaNum = steamCache[alvo.steamId]?.rating || 0;
                        let totalReviews = steamCache[alvo.steamId]?.total_reviews || 0;

                        if (revJson?.success && revJson.query_summary) {
                            totalReviews = revJson.query_summary.total_reviews || 0;
                            if (totalReviews > 0) {
                                notaNum = Math.trunc((revJson.query_summary.total_positive * 100) / totalReviews);
                            }
                        }

                        steamCache[alvo.steamId] = { 
                            ...(steamCache[alvo.steamId] || {}), 
                            ...gData, 
                            rating: notaNum, 
                            total_reviews: totalReviews, 
                            updated_at: agora 
                        };
                        cacheAtualizado = true;
                    }
                    await new Promise(r => setTimeout(r, 600));
                } catch (err) {}
            }
        }

        const precisaLimparExcedentes = Object.keys(steamCache).length > 50;
        if (novosItens.length === 0 && !cacheAtualizado && !precisaLimparExcedentes) {
            return res.status(200).json({ message: 'Sem lançamentos novos e cache em dia.', checked: 0 });
        }

        novosItens.sort((a, b) => (a.published || 0) - (b.published || 0));

        if (novosItens.length > 10) {
            novosItens = novosItens.slice(0, 10);
        }

        // 6. Carrega os inscritos nas notificações Push
        const getSubsRes = await fetch(`${KV_REST_API_URL}/get/push_subscriptions`, {
            headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
        });
        const getSubsData = await getSubsRes.json();
        let subscriptions = [];
        if (getSubsData?.result) {
            subscriptions = typeof getSubsData.result === 'string' ? JSON.parse(getSubsData.result) : getSubsData.result;
        }

        let disparosDeletados = false;

        // 7. Envia notificações Push para os novos lançamentos
        for (const item of novosItens) {
            const htmlContent = item.content?.content || item.summary?.content || '';
            
            // Limpa o HTML antes de rodar o Regex do Tamanho para ignorar tags como <strong>SIZE:</strong>
            const plainText = decodeHTMLEntities(htmlContent.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
            const sizeMatch = plainText.match(/Size\s*:\s*([\d.,]+\s*(?:GB|MB|KB|GiB|MiB))/i) || plainText.match(/Size\s*:\s*([\d.,]+\s*[a-zA-Z]+)/i);
            const size = sizeMatch ? sizeMatch[1].trim() : 'N/A';

            // Resgata metadados da Steam já anexados pelo obterPostsSkidrow ou pelo cache KV
            const steamDetails = item.steamDetails;
            let steamHeaderImg = steamDetails?.header_image || '';
            let notaTexto = steamDetails?.rating > 0 ? `${steamDetails.rating}%` : 'Sem nota';
            let totalReviews = steamDetails?.total_reviews || 0;
            let lancamento = steamDetails?.release_date?.date || 'N/A';

            const steamId = item.resolvedSteamId || await resolverSteamId(htmlContent);

            if (steamId && (!steamHeaderImg || !steamDetails)) {
                try {
                    const [steamRes, revJson] = await Promise.all([
                        fetch(`https://store.steampowered.com/api/appdetails?appids=${steamId}&filters=basic,release_date,genres,developers,screenshots,categories,movies,background&l=brazilian&cc=BR`, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0',
                                'Cookie': 'birthtime=283993200; mature_content=1; lastagecheckage=1-0-1990',
                                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
                            }
                        }),
                        obterReviewsSeguro(steamId)
                    ]);

                    const steamJson = await steamRes.json();
                    const game = steamJson[steamId] ?? Object?.values(steamJson)[0];

                    if (game?.success && game?.data) {
                        const gData = game.data;
                        if (gData.header_image) steamHeaderImg = gData.header_image;

                        if (gData.release_date?.date) {
                            lancamento = gData.release_date.date;
                        }

                        let notaNum = 0;
                        if (revJson?.success && revJson.query_summary) {
                            totalReviews = revJson.query_summary.total_reviews || 0;
                            if (totalReviews > 0) {
                                notaNum = Math.trunc((revJson.query_summary.total_positive * 100) / totalReviews);
                                notaTexto = `${notaNum}%`;
                            }
                        }

                        steamCache[steamId] = {
                            ...(steamCache[steamId] || {}),
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
                            rating: notaNum,
                            total_reviews: totalReviews,
                            updated_at: Date.now()
                        };
                        cacheAtualizado = true;
                    }
                } catch (e) {}
            }

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

            let imgFinal = `${DOMAIN_URL}/assets/logo2.png`;
            if (rawImg && rawImg.startsWith('http')) {
                imgFinal = `${DOMAIN_URL}/api/cover-proxy?url=${encodeURIComponent(rawImg)}`;
            } else if (rawImg.startsWith('/')) {
                imgFinal = `${DOMAIN_URL}${rawImg}`;
            }

            const indexHifen = item.title.lastIndexOf('-');
            const tituloLimpo = indexHifen !== -1 ? item.title.slice(0, indexHifen).trim() : item.title.trim();

            let totalReviewsFormatado = totalReviews > 1000 ? `${(totalReviews / 1000).toFixed(1)}k` : totalReviews;

            const payload = JSON.stringify({
                id: item.id,
                title: tituloLimpo,
                body: `${notaTexto} (${totalReviewsFormatado}) | ${formatarDataRelativa(lancamento)} | ${size}`,
                cover: imgFinal,
                url: `${DOMAIN_URL}/?id=${encodeURIComponent(item.id)}`,
                timestamp: item.published || Date.now()
            });

            await Promise.allSettled(subscriptions.map(async (sub) => {
                try {
                    await webpush.sendNotification(sub, payload);
                } catch (err) {
                    if (err.statusCode === 404 || err.statusCode === 410) {
                        subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
                        disparosDeletados = true;
                    }
                }
            }));

            if (novosItens.length > 1) {
                await new Promise(r => setTimeout(r, 600));
            }
        }

        // Limpa assinaturas Push inativas se houver
        if (disparosDeletados) {
            await fetch(`${KV_REST_API_URL}/set/push_subscriptions`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(subscriptions)
            });
        }

        // 8. Limpeza de cache excedente e cálculo de destaques da home
        if (cacheAtualizado || precisaLimparExcedentes) {
            try {
                limparCacheSteam(steamCache, items, 50);

                await fetch(`${KV_REST_API_URL}/set/steam_metadata_cache`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(steamCache)
                });

                const agoraDestaque = Date.now();
                const limite24h = 24 * 60 * 60 * 1000;
                const candidatos = items.slice(0, 50).filter(i => (agoraDestaque - (i.published || 0)) <= limite24h);

                const listaJogos = [];
                for (const item of candidatos) {
                    const htmlContent = item.content?.content || item.summary?.content || '';
                    const textContent = item.summary?.content || htmlContent;
                    const id = item.resolvedSteamId || await resolverSteamId(htmlContent + ' ' + textContent);

                    if (id && steamCache[id]) {
                        const dados = steamCache[id];
                        const nota = dados.rating || 0;
                        const revs = Math.max(dados.total_reviews || 1, 1);
                        const score = (nota * 0.7) + (Math.log10(revs) * 10 * 0.3);

                        listaJogos.push({ 
                            steamId: id, 
                            score, 
                            ...dados, 
                            published: item.published
                        });
                    }
                }

                listaJogos.sort((a, b) => b.score - a.score);
                const top5Destaques = listaJogos.slice(0, 5);

                await fetch(`${KV_REST_API_URL}/set/destaques_home`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(top5Destaques)
                });
            } catch (errKv) {}
        }

        // 9. Atualiza o timestamp da última execução da Cron
        if (!forcarTesteManual && novosItens.length > 0) {
            const maiorTimestamp = Math.max(...novosItens.map(i => i.published || 0));
            if (isFinite(maiorTimestamp) && maiorTimestamp > 0) {
                await fetch(`${KV_REST_API_URL}/set/last_checked_cron`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(maiorTimestamp)
                });
            }
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