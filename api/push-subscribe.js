export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'KV não configurado.' });
    }

    try {
        const { subscription, token } = req.body || {};
        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ error: 'Objeto de inscrição inválido.' });
        }

        // 1. Busca a lista atual de inscrições salvas no KV
        const getResponse = await fetch(`${KV_REST_API_URL}/get/push_subscriptions`, {
            headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
        });
        const getData = await getResponse.json();
        let subscriptions = [];
        
        if (getData && getData.result) {
            subscriptions = typeof getData.result === 'string' ? JSON.parse(getData.result) : getData.result;
        }

        // 2. Evita inscrições duplicadas comparando o endpoint único
        const jaExiste = subscriptions.some(sub => sub.endpoint === subscription.endpoint);
        if (!jaExiste) {
            subscriptions.push({
                ...subscription,
                userToken: token || 'anônimo',
                createdAt: Date.now()
            });

            // 3. Salva a nova lista de volta no banco via API REST
            await fetch(`${KV_REST_API_URL}/set/push_subscriptions`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${KV_REST_API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(subscriptions)
            });
        }

        return res.status(200).json({ success: true, count: subscriptions.length });
    } catch (error) {
        console.error('Erro ao salvar inscrição Push:', error);
        return res.status(500).json({ error: 'Erro interno ao persistir inscrição.' });
    }
}