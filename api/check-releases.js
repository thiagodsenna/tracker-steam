import webpush from 'web-push';

export default async function handler(req, res) {
    // 1. Barreira de Segurança: Só permite execução se o segredo da URL estiver correto[cite: 6]
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
        // Domínio base absoluto para os assets e links
        const DOMAIN_URL = 'https://tracker-steam.vercel.app';

        // 2. Busca o timestamp da última checagem no Vercel KV[cite: 6]
        const getCronTimeRes = await fetch(`${KV_REST_API_URL}/get/last_checked_cron`, {
            headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
        });
        const getCronTimeData = await getCronTimeRes.json();
        
        // Se for a primeira execução da vida, assume 15 minutos atrás para não fludar os usuários com 200 alertas[cite: 6]
        let lastChecked = getCronTimeData?.result ? parseInt(getCronTimeData.result, 10) : (Date.now() - 15 * 60 * 1000);

        // 3. Busca o feed RSS/JSON atualizado do Skidrow no Feedly (mesmo endpoint usado no seu app)[cite: 6]
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
            // Filtra apenas os jogos publicados APÓS a última checagem[cite: 6]
            novosItens = items.filter(item => (item.published || 0) > lastChecked);
        }

        if (novosItens.length === 0) {
            return res.status(200).json({ message: 'Nenhum release novo desde a última verificação.', checked: novosItens.length });
        }

        // 4. Busca todos os dispositivos inscritos no banco[cite: 6]
        const getSubsRes = await fetch(`${KV_REST_API_URL}/get/push_subscriptions`, {
            headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
        });
        const getSubsData = await getSubsRes.json();
        let subscriptions = [];
        if (getSubsData && getSubsData.result) {
            subscriptions = typeof getSubsData.result === 'string' ? JSON.parse(getSubsData.result) : getSubsData.result;
        }

        // Se for teste manual e você informou seu token, restringe o envio APENAS ao seu dispositivo
        if (forcarTesteManual && tokenAlvo) {
            subscriptions = subscriptions.filter(sub => sub.userToken === tokenAlvo);
        }

        if (subscriptions.length === 0) {
            return res.status(200).json({ message: 'Nenhum usuário correspondente encontrado para receber o push de teste.', newItems: novosItens.length });
        }

        let disparosDeletados = false;

        // 5. Para cada jogo novo, processa a capa e envia o alerta para os inscritos[cite: 6]
        for (const item of novosItens) {
            // Extração segura da capa sem precisar de DOMParser no backend
            const htmlContent = item.content?.content || item.summary?.content || '';
            const imgMatches = [...htmlContent.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];
            
            // Filtra avatares ou logos do Skidrow seguindo a mesma regra do seu frontend
            let capaValida = '';
            for (const match of imgMatches) {
                const src = match[1].toLowerCase();
                if (!src.includes('logo') && !src.includes('theme') && !src.includes('header') && !src.includes('avatar') && !src.includes('steamstatic')) {
                    capaValida = match[1];
                    break;
                }
            }
            // Garante URL absoluta para a capa (se vier relativa ou externa)
            let imgFinal = capaValida || item.visual?.url || `${DOMAIN_URL}/assets/logo2.png`;
            if (imgFinal.startsWith('/')) {
                imgFinal = `${DOMAIN_URL}${imgFinal}`;
            }

            // Limpa o título (pega o nome base antes do hífen do release)
            const indexHifen = item.title.lastIndexOf('-');
            const tituloLimpo = indexHifen !== -1 ? item.title.slice(0, indexHifen).trim() : item.title.trim();

            const payload = JSON.stringify({
                title: tituloLimpo,
                body: `Novo lançamento disponível: ${item.title}`,
                cover: imgFinal,
                url: item.alternate?.[0]?.href || `${DOMAIN_URL}/`
            });

            // Dispara para as inscrições em paralelo[cite: 6]
            await Promise.allSettled(subscriptions.map(async (sub) => {
                try {
                    await webpush.sendNotification(sub, payload);
                } catch (err) {
                    // Se o celular do usuário não existe mais (404/410), marca para remover do Vercel KV[cite: 6]
                    if (err.statusCode === 404 || err.statusCode === 410) {
                        subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
                        disparosDeletados = true;
                    }
                }
            }));
        }

        // 6. Se houveram inscrições expiradas (dispositivos antigos), atualiza o KV para economizar memória[cite: 6]
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