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
        if (forcarTesteManual && tokenAlvo) {
            const filtrados = subscriptions.filter(sub => sub.userToken === tokenAlvo);
            if (filtrados.length > 0) {
                subscriptions = filtrados;
            }
        }

        if (subscriptions.length === 0) {
            return res.status(200).json({ message: 'Há novos jogos, mas nenhum usuário inscrito para receber push.', newItems: novosItens.length });
        }

        let disparosDeletados = false;

        // 5. Para cada jogo novo, processa a capa (tentando a horizontal da Steam) e envia o alerta
        for (const item of novosItens) {
            const htmlContent = item.content?.content || item.summary?.content || '';
            const textContent = item.summary?.content || htmlContent;

            // Extrai o Steam ID do post (mesma regex do frontend)
            const steamMatch = htmlContent.match(/(?:store\.steampowered\.com|steamcommunity\.com)\/app\/(\d+)/i) 
                            || textContent.match(/(?:store\.steampowered\.com|steamcommunity\.com)\/app\/(\d+)/i);
            const steamId = steamMatch ? steamMatch[1] : null;

            let steamHeaderImg = '';
            if (steamId) {
                try {
                    const steamRes = await fetch(`https://store.steampowered.com/api/appdetails?appids=${steamId}&filters=basic`);
                    const steamJson = await steamRes.json();
                    if (steamJson[steamId]?.success && steamJson[steamId]?.data?.header_image) {
                        steamHeaderImg = steamJson[steamId].data.header_image;
                    }
                } catch (e) {
                    console.log('Não foi possível buscar o header da Steam, usando fallback.', e);
                }
            }

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