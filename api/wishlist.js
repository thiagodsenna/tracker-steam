export default async function handler(req, res) {
    // Cabeçalhos CORS para permitir requisições locais (localhost) e de produção
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // A Vercel injeta automaticamente essas variáveis ao conectar o Vercel KV / Upstash
    const KV_REST_API_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
        return res.status(500).json({ error: 'Servidor KV não configurado.' });
    }

    try {
        // GET: Carregar Wishlist (Meta ou Full)
        if (req.method === 'GET') {
            const { action, token } = req.query;
            
            if (!token) {
                return res.status(400).json({ error: 'Token do usuário obrigatório.' });
            }

            const tokenSafe = encodeURIComponent(token);

            // AÇÃO: META (Retorna apenas o timestamp)
            if (action === 'meta') {
                const response = await fetch(`${KV_REST_API_URL}/get/wishlist_meta:${tokenSafe}`, {
                    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
                });
                
                const data = await response.json();
                let timestamp = 0;
                
                if (data && data.result) {
                    timestamp = parseInt(data.result, 10);
                }
                
                return res.status(200).json({ timestamp });
            } 
            
            // AÇÃO: FULL (Retorna a array completa da wishlist)
            else if (action === 'full') {
                const response = await fetch(`${KV_REST_API_URL}/get/wishlist:${tokenSafe}`, {
                    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
                });
                
                const data = await response.json();
                let wishlist = [];
                if (data && data.result) {
                    wishlist = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
                }

                return res.status(200).json({ success: true, wishlist });
            }
            
            else {
                return res.status(400).json({ error: 'Ação inválida. Use ?action=meta ou ?action=full' });
            }
        }

        // POST: Salvar/Atualizar Wishlist Completa e Meta simultaneamente
        if (req.method === 'POST') {
            const { token, wishlist } = req.body;
            if (!token || !Array.isArray(wishlist)) {
                return res.status(400).json({ error: 'Dados inválidos. Token e array de wishlist são obrigatórios.' });
            }

            const tokenSafe = encodeURIComponent(token);
            const agora = Date.now();

            // 1. Salva a Wishlist Enxuta
            const wishlistPromise = fetch(`${KV_REST_API_URL}/set/wishlist:${tokenSafe}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${KV_REST_API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(wishlist)
            });

            // 2. Salva o Meta Header (apenas o timestamp) para controle de banda do Frontend
            const metaPromise = fetch(`${KV_REST_API_URL}/set/wishlist_meta:${tokenSafe}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${KV_REST_API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(agora)
            });

            // Executa as duas gravações em paralelo para máxima performance
            await Promise.all([wishlistPromise, metaPromise]);

            return res.status(200).json({ success: true, timestamp: agora });
        }

        return res.status(405).json({ error: 'Método não permitido.' });
    } catch (error) {
        console.error('Erro na API de Wishlist:', error);
        return res.status(500).json({ error: 'Erro interno no servidor ao processar wishlist.' });
    }
}