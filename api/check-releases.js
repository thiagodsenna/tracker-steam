import webpush from 'web-push';

export default async function handler(req, res) {
    // 1. Barreira de Segurança: Permite verificação via ?secret= OU Authorization Bearer[cite: 6]
    const secretParam = req.query?.secret || req.headers?.authorization?.replace('Bearer ', '');
    if (secretParam !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Acesso não autorizado. Chave de cron incorreta.' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'KV não configurado nas variáveis de ambiente.' });
    }

    // Configura as chaves no módulo web-push com fallback seguro para o mailto[cite: 5, 6]
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@tracker-steam.vercel.app';
    webpush.setVapidDetails(
        vapidSubject.startsWith('mailto:') || vapidSubject.startsWith('http') ? vapidSubject : `mailto:${vapidSubject}`,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );

    try {
        // 2. Busca o timestamp da última checagem no Vercel KV[cite: 6]
        const getCronTimeRes = await fetch(`${KV_REST_API_URL}/get/last_checked_cron`, {
            headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
        });
        const getCronTimeData = await getCronTimeRes.json();
        
        let lastCheckedRaw = getCronTimeData?.result;
        let isFirstRun = !lastCheckedRaw;
        
        // CORREÇÃO: Se o KV estiver vazio (primeira rodada), olhamos 24h para trás para pegar os lançamentos recentes.[cite: 6]
        // Se já existir no banco, usamos o valor salvo em milissegundos.[cite: 6]
        let lastChecked = isFirstRun ? (Date.now() - 24 * 60 * 60 * 1000) : parseInt(lastCheckedRaw, 10);

        // 3. Busca o feed RSS/JSON atualizado do Skidrow no Feedly[cite: 6]
        const feedUrl = 'https://api.feedly.com/v3/streams/contents?streamId=feed%2Fhttps%3A%2F%2Fwww.skidrowreloaded.com%2Fcategory%2Fpc-games%2Ffeed%2F&count=20&ranked=newest&ct=feedly.desktop&cv=31.0.3081';
        const feedRes = await fetch(feedUrl);
        const feedData = await feedRes.json();

        const items = feedData.items || [];
        
        // CORREÇÃO: Filtra jogos usando Math.max(published, crawled) para não perder posts que o Feedly demorou a indexar[cite: 6]
        const novosItens = items.filter(item => {
            const itemTime = Math.max(item.published || 0, item.crawled || 0, item.updated || 0);
            return itemTime > lastChecked;
        });

        // Pegamos sempre o timestamp mais recente encontrado na lista atual do Feedly[cite: 6]
        const timestampMaisRecenteDoFeed = items.length > 0 ? Math.max(...items.map(i => Math.max(i.published || 0, i.crawled || 0))) : Date.now();

        // CORREÇÃO DO DEADLOCK: Se for a primeira execução da vida e não houver jogos na janela,[cite: 6]
        // OBRIGATORIAMENTE salvamos o timestamp atual no KV para criar a chave e destravar o cron![cite: 6]
        if (isFirstRun && novosItens.length === 0) {
            await fetch(`${KV_REST_API_URL}/set/last_checked_cron`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(timestampMaisRecenteDoFeed)
            });
        }

        if (novosItens.length === 0) {
            return res.status(200).json({ 
                message: 'Nenhum release novo desde a última verificação.', 
                checked: 0,
                debug: {
                    isFirstRun,
                    lastCheckedKV: lastChecked,
                    lastCheckedData: new Date(lastChecked).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
                    feedMaisRecente: timestampMaisRecenteDoFeed,
                    feedMaisRecenteData: new Date(timestampMaisRecenteDoFeed).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
                    totalItensAnalisadosNoFeed: items.length
                }
            });
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

        if (subscriptions.length === 0) {
            // Mesmo sem inscritos, atualizamos o last_checked_cron para não acumular notificações velhas[cite: 6]
            await fetch(`${KV_REST_API_URL}/set/last_checked_cron`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(timestampMaisRecenteDoFeed)
            });

            return res.status(200).json({ message: 'Há novos jogos, mas nenhum usuário inscrito para receber push.', newItems: novosItens.length });
        }

        let disparosDeletados = false;
        let totalNotificados = 0;

        // 5. Para cada jogo novo, processa a capa e envia o alerta para todos os inscritos[cite: 6]
        for (const item of novosItens) {
            const htmlContent = item.content?.content || item.summary?.content || '';
            const imgMatches = [...htmlContent.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];
            
            let capaValida = '';
            for (const match of imgMatches) {
                const src = match[1].toLowerCase();
                if (!src.includes('logo') && !src.includes('theme') && !src.includes('header') && !src.includes('avatar') && !src.includes('steamstatic')) {
                    capaValida = match[1];
                    break;
                }
            }
            const imgFinal = capaValida || item.visual?.url || '/assets/logo2.png';

            const indexHifen = item.title.lastIndexOf('-');
            const tituloLimpo = indexHifen !== -1 ? item.title.slice(0, indexHifen).trim() : item.title.trim();

            const payload = JSON.stringify({
                title: tituloLimpo,
                body: `Novo lançamento disponível: ${item.title}`,
                cover: imgFinal,
                url: item.alternate?.[0]?.href || item.originId || '/'
            });

            // Dispara para todas as inscrições em paralelo de forma segura[cite: 6]
            const resultados = await Promise.allSettled(subscriptions.map(async (sub) => {
                try {
                    await webpush.sendNotification(sub, payload);
                    return true;
                } catch (err) {
                    // Se o celular do usuário não existe mais (404/410), marca para remover do Vercel KV[cite: 6]
                    if (err.statusCode === 404 || err.statusCode === 410) {
                        subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
                        disparosDeletados = true;
                    }
                    throw err;
                }
            }));

            const sucessos = resultados.filter(r => r.status === 'fulfilled').length;
            if (sucessos > 0) totalNotificados++;
        }

        // 6. Se houveram inscrições expiradas (dispositivos antigos), atualiza o KV[cite: 6]
        if (disparosDeletados) {
            await fetch(`${KV_REST_API_URL}/set/push_subscriptions`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(subscriptions)
            });
        }

        // 7. Salva o timestamp mais recente do feed para a próxima execução do cron[cite: 6]
        await fetch(`${KV_REST_API_URL}/set/last_checked_cron`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(timestampMaisRecenteDoFeed)
        });

        return res.status(200).json({ 
            success: true, 
            novosJogosEncontrados: novosItens.length,
            jogosNotificadosComSucesso: totalNotificados,
            dispositivosAtendidos: subscriptions.length 
        });

    } catch (error) {
        console.error('Erro na verificação de cron:', error);
        return res.status(500).json({ error: 'Erro interno ao processar cron job.', details: error.message });
    }
}