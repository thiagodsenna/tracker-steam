export default async function handler(req, res) {
    // 1. Liberamos o método GET nos cabeçalhos CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const KV_REST_API_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'KV não configurado nas variáveis de ambiente.' });
    }

    // =========================================================================
    // --- GATILHO DE TESTE VIA NAVEGADOR (GET) ---
    // =========================================================================
    if (req.method === 'GET' && req.query.action === 'test') {
        const token = req.query.token;
        if (!token) return res.status(400).json({ error: 'Token obrigatório para o teste. Passe ?token=SEU_TOKEN na URL.' });

        try {
            // 1. Busca a lista completa de inscrições salva no Vercel KV
            const subData = await fetch(`${KV_REST_API_URL}/get/push_subscriptions`, {
                headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
            }).then(r => r.json());

            let subscriptions = [];
            if (subData && subData.result) {
                subscriptions = typeof subData.result === 'string' ? JSON.parse(subData.result) : subData.result;
            }

            // 2. Procura na lista o aparelho que tem o userToken igual ao que você passou na URL
            const aparelhoAlvo = subscriptions.find(sub => sub.userToken === token);

            if (!aparelhoAlvo) {
                return res.status(404).json({ 
                    error: 'Nenhuma inscrição encontrada para este token.',
                    dica: 'Abra o app no Vivaldi do celular e clique no botão de ativar notificações antes de testar.',
                    totalCadastradosNoServidor: subscriptions.length 
                });
            }

            // 3. Configura o web-push
            const webPush = require('web-push');
            
            // ATENÇÃO: O primeiro parâmetro OBRIGATORIAMENTE deve ser um "mailto:seuemail@real.com" ou URL do site
            webPush.setVapidDetails(
                'mailto:admin@tracker-steam.vercel.app', 
                process.env.VAPID_PUBLIC_KEY,
                process.env.VAPID_PRIVATE_KEY
            );

            // 4. Dispara a carga útil de teste para o endpoint encontrado
            const payload = JSON.stringify({
                title: "🚀 Teste do Servidor Vercel!",
                body: "O web-push encontrou seu Vivaldi no Android e disparou com sucesso!",
                url: "/"
            });

            // Passamos apenas os dados nativos que o web-push espera (endpoint, keys, etc)
            const pushSubscription = {
                endpoint: aparelhoAlvo.endpoint,
                keys: aparelhoAlvo.keys,
                expirationTime: aparelhoAlvo.expirationTime || null
            };

            await webPush.sendNotification(pushSubscription, payload);
            return res.status(200).json({ success: true, message: "Notificação disparada com sucesso para o celular!" });

        } catch (err) {
            console.error("Erro no teste de push:", err);
            return res.status(500).json({ 
                error: err.message || 'Falha ao enviar push', 
                dica: 'Verifique se as chaves VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY da Vercel são exatamente o mesmo par.' 
            });
        }
    }

    // =========================================================================
    // --- CADASTRO DE NOVAS INSCRIÇÕES (POST) ---
    // =========================================================================
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido. Use POST para cadastro ou GET ?action=test para testar.' });
    }

    try {
        const { subscription, token } = req.body || {};
        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ error: 'Objeto de inscrição inválido.' });
        }

        const getResponse = await fetch(`${KV_REST_API_URL}/get/push_subscriptions`, {
            headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
        });
        const getData = await getResponse.json();
        let subscriptions = [];
        
        if (getData && getData.result) {
            subscriptions = typeof getData.result === 'string' ? JSON.parse(getData.result) : getData.result;
        }

        const jaExiste = subscriptions.some(sub => sub.endpoint === subscription.endpoint);
        if (!jaExiste) {
            subscriptions.push({
                ...subscription,
                userToken: token || 'anônimo',
                createdAt: Date.now()
            });

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