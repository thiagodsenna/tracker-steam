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

    // --- ADICIONE ESTE BLOCO PARA CRIAR O GATILHO DE TESTE ---
    if (req.method === 'GET' && req.query.action === 'test') {
        const token = req.query.token;
        if (!token) return res.status(400).json({ error: 'Token obrigatório para o teste' });

        try {
            // 1. Busca a inscrição salva no Vercel KV
            const key = `push_sub:${encodeURIComponent(token)}`; // Ajuste para o nome da chave que você usa no KV
            const subData = await fetch(`${KV_REST_API_URL}/get/${key}`, {
                headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
            }).then(r => r.json());

            let subscription = subData?.result;
            if (typeof subscription === 'string') subscription = JSON.parse(subscription);

            if (!subscription) {
                return res.status(404).json({ error: 'Nenhuma inscrição encontrada para este token.' });
            }

            // 2. Configura o web-push (mantenha suas chaves e subject atuais)
            const webPush = require('web-push');
            webPush.setVapidDetails(
                'mailto:seu-email@dominio.com', // Obrigatório ser um mailto ou URL válida
                process.env.VAPID_PUBLIC_KEY,
                process.env.VAPID_PRIVATE_KEY
            );

            // 3. Dispara a carga útil de teste
            const payload = JSON.stringify({
                title: "🚀 Teste do Servidor Vercel!",
                body: "O web-push encontrou seu dispositivo e disparou com sucesso.",
                url: "/"
            });

            await webPush.sendNotification(subscription, payload);
            return res.status(200).json({ success: true, message: "Notificação enviada ao servidor de push!" });

        } catch (err) {
            console.error("Erro no teste de push:", err);
            return res.status(500).json({ error: err.message, details: err });
        }
    }
    // --- FIM DO BLOCO DE TESTE ---

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