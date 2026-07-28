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

    function formatarDataRelativa(dataString) {
        let dataPost;
        
        // Verifica se é uma data no formato "MMM DD, YYYY" (Ex: Jul 16, 2026)
        if (isNaN(Date.parse(dataString)) && /^[a-zA-Z]{3}\s\d{1,2},\s\d{4}$/.test(dataString)) {
            const mesesIngles = {
                'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
                'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
            };
            const partes = dataString.replace(',', '').split(' ');
            const mes = mesesIngles[partes[0]];
            const dia = parseInt(partes[1]);
            const ano = parseInt(partes[2]);
            dataPost = new Date(ano, mes, dia);
        } else {
            dataPost = new Date(dataString);
        }

        if (isNaN(dataPost.getTime())) return dataString; // Fallback caso falhe

        const hoje = new Date();
        
        // Zera as horas para comparar apenas os dias
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

        return dataString;
    }

    // Função auxiliar para extrair ou resolver o Steam ID (suportando /app/ e /bundle/)
    async function resolverSteamId(contentText) {
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
            } catch (err) {
                console.error(`Erro ao resolver bundle ${bundleId} no cron:`, err);
            }
        }
        return null;
    }

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
        const feedUrl = 'https://api.feedly.com/v3/streams/contents?streamId=feed%2Fhttps%3A%2F%2Fwww.skidrowreloaded.com%2Fcategory%2Fpc-games%2Ffeed%2F&count=50&ranked=newest&ct=feedly.desktop&cv=31.0.3081';
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

        // =================================================================
        // --- INÍCIO: MANUTENÇÃO INTELIGENTE DE CACHE (SMART REFRESH) ---
        // =================================================================
        // Roda em TODOS os crons, avaliando apenas os 50 jogos mais recentes do feed (os que aparecem na Home)
        const candidatosHome = items.slice(0, 50);
        const agora = Date.now();
        const filaParaAtualizar = [];

        for (const item of candidatosHome) {
            const htmlContent = item.content?.content || item.summary?.content || '';
            const textContent = item.summary?.content || htmlContent;
            const steamId = await resolverSteamId(htmlContent + ' ' + textContent);

            // CORREÇÃO: Permitir itens novos sem cache prévio ou com cache existente
            if (steamId) {
                const dados = steamCache[steamId] || {};
                const ultimaAtualizacao = dados.updated_at || 0;
                const tempoDesdeAtualizacao = agora - ultimaAtualizacao;
                const totalReviews = dados.total_reviews || 0;
                const idadeRelease = agora - (item.published || 0);

                // Define o Cooldown ideal com base na Matriz de Volatilidade
                let cooldownNecessario = 24 * 60 * 60 * 1000; // Padrão Tier 3: 24 horas

                if (totalReviews < 100 || idadeRelease <= (48 * 60 * 60 * 1000)) {
                    cooldownNecessario = 30 * 60 * 1000; // Tier 1: 30 minutos
                } else if (totalReviews < 1000 || idadeRelease <= (7 * 24 * 60 * 60 * 1000)) {
                    cooldownNecessario = 3 * 60 * 60 * 1000; // Tier 2: 3 horas
                }

                // Se não existir no cache ou se o tempo sem atualizar superou o cooldown, entra na fila
                if (!steamCache[steamId] || tempoDesdeAtualizacao >= cooldownNecessario) {
                    filaParaAtualizar.push({ 
                        steamId, 
                        tempoDesdeAtualizacao: !steamCache[steamId] ? Infinity : tempoDesdeAtualizacao 
                    });
                }
            }
        }

        // Trava Vercel: Ordena pelos mais desatualizados e processa NO MÁXIMO 10 jogos por ciclo!
        filaParaAtualizar.sort((a, b) => b.tempoDesdeAtualizacao - a.tempoDesdeAtualizacao);
        const loteAtualizacao = filaParaAtualizar.slice(0, 10);

        if (loteAtualizacao.length > 0) {
            console.log(`[Smart Refresh] Atualizando notas de ${loteAtualizacao.length} jogos voláteis...`);
            for (const alvo of loteAtualizacao) {
                try {
                    const [steamRes, revRes] = await Promise.all([
                        fetch(`https://store.steampowered.com/api/appdetails?appids=${alvo.steamId}&filters=basic,release_date,genres,developers,screenshots,categories,movies,background`),
                        fetch(`https://store.steampowered.com/appreviews/${alvo.steamId}?json=1&filter=all&language=all&day_range=1000&num_per_page=1`)
                    ]);
                    
                    const steamJson = await steamRes.json();
                    const revJson = await revRes.json();

                    if (steamJson[alvo.steamId]?.success && steamJson[alvo.steamId]?.data) {
                        const gData = steamJson[alvo.steamId].data;
                        let notaNum = steamCache[alvo.steamId]?.rating || 0;
                        let totalReviews = steamCache[alvo.steamId]?.total_reviews || 0;

                        if (revJson && revJson.success && revJson.query_summary) {
                            totalReviews = revJson.query_summary.total_reviews || 0;
                            if (totalReviews > 0) {
                                notaNum = Math.trunc((revJson.query_summary.total_positive * 100) / totalReviews);
                            }
                        }

                        // Preserva o cache com fallback seguro, atualizando apenas os dados novos e o carimbo de tempo
                        steamCache[alvo.steamId] = { 
                            ...(steamCache[alvo.steamId] || {}), 
                            ...gData, 
                            rating: notaNum, 
                            total_reviews: totalReviews, 
                            updated_at: agora 
                        };
                        cacheAtualizado = true;
                    }
                    await new Promise(r => setTimeout(r, 600)); // Pequeno delay para evitar bloqueio do rate-limit
                } catch (err) {
                    console.error(`Erro no Smart Refresh para o ID ${alvo.steamId}:`, err);
                }
            }
        }
        // =================================================================
        // --- FIM: MANUTENÇÃO INTELIGENTE DE CACHE ---
        // =================================================================

        // AGORA SIM: Se não houver jogos novos E o cache também não mudou, encerra o script!
        if (novosItens.length === 0 && !cacheAtualizado) {
            return res.status(200).json({ message: 'Sem lançamentos novos e cache em dia.', checked: 0 });
        }

        // =================================================================
        // AJUSTE 1: BLINDAGEM CONTRA TIMEOUT E PERDA DE ITENS (FILA CRONOLÓGICA)
        // 1. Ordenamos do mais antigo para o mais novo para garantir que as notificações
        //    cheguem no celular na ordem cronológica real em que foram lançadas.
        // 2. Aumentamos o limite para 10 itens por ciclo. Caso saiam 15 jogos de uma vez,
        //    como salvamos o timestamp do ÚLTIMO item processado no lote, os 5 restantes
        //    serão recolhidos e notificados com segurança na próxima execução do cron!
        // =================================================================
        novosItens.sort((a, b) => (a.published || 0) - (b.published || 0));

        if (novosItens.length > 10) {
            novosItens = novosItens.slice(0, 10);
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

        let disparosDeletados = false;

        // =================================================================
        // 5. LOOP DE NOTIFICAÇÕES COM RESPEITO A TAXA DE DISPARO (THROTTLE)
        // =================================================================

        // 5. Para cada jogo novo, processa a capa (tentando a horizontal da Steam) e envia o alerta
        for (const item of novosItens) {
            const htmlContent = item.content?.content || item.summary?.content || '';
            const textContent = item.summary?.content || htmlContent;

            // 1) EXTRAÇÃO DO TAMANHO (Via Regex no texto do post)
            const sizeMatch = textContent.match(/Size:\s*([\d.,]+\s*[a-zA-Z]+)/i);
            const size = sizeMatch ? sizeMatch[1].trim() : 'N/A';

            // Extrai o Steam ID do post (suportando app e bundle)
            const steamId = await resolverSteamId(htmlContent + ' ' + textContent);

            let steamHeaderImg = '';
            // 2) DECLARAÇÃO DE VARIÁVEIS COM ESCOPO EXTERNO PARA O PAYLOAD
            let notaTexto = 'Sem nota';
            let lancamento = 'N/A';
            let totalReviews = 0;
            
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
                        if (gData.header_image) steamHeaderImg = gData.header_image;

                        // Captura a data de lançamento se existir
                        if (gData.release_date?.date) {
                            lancamento = gData.release_date.date;
                        }

                        // Cálculo da Nota e extração do Total de Avaliações
                        let notaNum = 0;
                        if (revJson && revJson.success && revJson.query_summary) {
                            totalReviews = revJson.query_summary.total_reviews || 0;
                            if (totalReviews > 0) {
                                notaNum = Math.trunc((revJson.query_summary.total_positive * 100) / totalReviews);
                                notaTexto = `${notaNum}%`; // Formata com % para exibir na notificação
                            }
                        }

                        // Salva no cache do KV usando o valor numérico
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

            // Formata total de avaliações
            let totalReviewsFormatado = totalReviews > 1000 ? `${(totalReviews/1000).toFixed(1)}k` : totalReviews;

            // 3) PAYLOAD FINAL COM AS VARIÁVEIS FORMATADAS
            const payload = JSON.stringify({
                id: item.id,
                title: tituloLimpo,
                body: `${notaTexto} (${totalReviewsFormatado}) | ${formatarDataRelativa(lancamento)} | ${size}`,
                cover: imgFinal,
                url: `${DOMAIN_URL}/?id=${encodeURIComponent(item.id)}`,
                timestamp: item.published || Date.now()
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

            // Reduzimos o delay de 1500ms para 600ms para processar até 10 jogos em ~5.4 segundos,
            // mantendo a execução segura e bem abaixo do limite de 10s da Vercel Free Tier.
            if (novosItens.length > 1) {
                await new Promise(r => setTimeout(r, 600));
            }
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

                // 2. Calcula os Top 5 Destaques avaliando APENAS os 50 itens mais recentes 
                // e que tenham sido postados no Feedly dentro das últimas 24 horas.
                const agoraDestaque = Date.now();
                const limite24h = 24 * 60 * 60 * 1000;
                const candidatos = items.slice(0, 50).filter(i => (agoraDestaque - (i.published || 0)) <= limite24h);

                const listaJogos = [];
                for (const item of candidatos) {
                    const htmlContent = item.content?.content || item.summary?.content || '';
                    const textContent = item.summary?.content || htmlContent;
                    const id = await resolverSteamId(htmlContent + ' ' + textContent);

                    if (id && steamCache[id]) {
                        const dados = steamCache[id];
                        const nota = dados.rating || 0;
                        const revs = Math.max(dados.total_reviews || 1, 1);
                        const score = (nota * 0.7) + (Math.log10(revs) * 10 * 0.3);

                        listaJogos.push({ 
                            steamId: id, 
                            score, 
                            ...dados, 
                            published: item.published // Salva o timestamp do Feedly no destaque
                        });
                    }
                }

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