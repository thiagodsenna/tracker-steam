export default async function handler(req, res) {
    // Cabeçalhos CORS para permitir requisições locais (localhost) e de produção
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PATCH');
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
        // Busca o token de forma segura na query, no corpo ou no cabeçalho Authorization
        const token = req.query?.token || req.body?.token || req.headers?.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(400).json({ error: 'Token do usuário obrigatório.' });
        }

        const key = `settings:${encodeURIComponent(token)}`;

        // GET: Carregar configurações do usuário via API REST nativa
        if (req.method === 'GET') {
            const response = await fetch(`${KV_REST_API_URL}/get/${key}`, {
                headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
            });
            
            const data = await response.json();
            let settings = {};
            
            // O Upstash retorna { result: "string_json" } ou null
            if (data && data.result) {
                settings = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
            }

            return res.status(200).json(settings);
        }

        // POST ou PATCH: Salvar/Atualizar configurações do usuário via API REST nativa[cite: 4]
        if (req.method === 'POST' || req.method === 'PATCH') {
            // 1. Busca as configurações atuais via REST para permitir atualizações parciais sem sobrescrever tudo[cite: 4]
            const getResponse = await fetch(`${KV_REST_API_URL}/get/${key}`, {
                headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
            });
            const getData = await getResponse.json();
            let currentSettings = {};
            
            if (getData && getData.result) {
                currentSettings = typeof getData.result === 'string' ? JSON.parse(getData.result) : getData.result;
            }

            // 2. Mescla as configurações antigas com os novos dados recebidos (Ex: mantendo outros ajustes no futuro)
            const novosDados = { ...(req.body || {}) };
            delete novosDados.token; // Remove o token do objeto para não salvá-lo em duplicidade dentro do JSON

            const updatedSettings = { ...currentSettings, ...novosDados };

            // 3. Salva no formato chave-valor (settings:TOKEN -> JSON) usando endpoint /set/[cite: 4]
            const setResponse = await fetch(`${KV_REST_API_URL}/set/${key}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${KV_REST_API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updatedSettings)
            });

            await setResponse.json();
            return res.status(200).json(updatedSettings);
        }

        return res.status(405).json({ error: 'Método não permitido.' });
    } catch (error) {
        console.error('Erro na API de Configurações:', error);
        return res.status(500).json({ error: 'Erro interno no servidor ao processar configurações.' });
    }
}