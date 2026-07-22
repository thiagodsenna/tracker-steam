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
        return res.status(500).json({ error: 'Servidor KV não configurado nas variáveis de ambiente da Vercel.' });
    }

    try {
        // GET: Carregar Wishlist do usuário
        if (req.method === 'GET') {
            const { token } = req.query;
            if (!token) return res.status(400).json({ error: 'Token do usuário obrigatório.' });

            const response = await fetch(`${KV_REST_API_URL}/get/wishlist:${encodeURIComponent(token)}`, {
                headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
            });
            
            const data = await response.json();
            // O Upstash retorna { result: "string_json" } ou null
            let wishlist = [];
            if (data && data.result) {
                wishlist = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
            }

            return res.status(200).json({ success: true, wishlist });
        }

        // POST: Salvar/Atualizar Wishlist do usuário
        if (req.method === 'POST') {
            const { token, wishlist } = req.body;
            if (!token || !Array.isArray(wishlist)) {
                return res.status(400).json({ error: 'Dados inválidos. Token e array de wishlist são obrigatórios.' });
            }

            // Salva no formato chave-valor (wishlist:TOKEN -> JSON)
            const response = await fetch(`${KV_REST_API_URL}/set/wishlist:${encodeURIComponent(token)}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${KV_REST_API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(wishlist)
            });

            const data = await response.json();
            return res.status(200).json({ success: true, result: data });
        }

        return res.status(405).json({ error: 'Método não permitido.' });
    } catch (error) {
        console.error('Erro na API de Wishlist:', error);
        return res.status(500).json({ error: 'Erro interno no servidor ao processar wishlist.' });
    }
}