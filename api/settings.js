import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // IMPORTANTE: Adapte a leitura do token para o mesmo padrão que você já utiliza na /api/wishlist
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token || req.body.token;
    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    const key = `user:settings:${token}`;

    if (req.method === 'GET') {
        try {
            const settings = await kv.get(key) || {};
            return res.status(200).json(settings);
        } catch (error) {
            return res.status(500).json({ error: 'Erro ao buscar configurações' });
        }
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
        try {
            const currentSettings = await kv.get(key) || {};
            // Mescla as configurações existentes com as novas recebidas no body
            const updatedSettings = { ...currentSettings, ...req.body };
            await kv.set(key, updatedSettings);
            return res.status(200).json(updatedSettings);
        } catch (error) {
            return res.status(500).json({ error: 'Erro ao salvar configurações' });
        }
    }

    return res.status(405).json({ error: 'Método não permitido' });
}