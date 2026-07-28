// Arquivo: api/torbox-proxy.js

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

    // ============================================================================
    // 🔑 CONFIGURAÇÃO DA API KEY DO TORBOX
    // ============================================================================
    // PARA TESTES INICIAIS: Cole sua chave do Torbox abaixo entre as aspas.
    // PARA PRODUÇÃO (FUTURO): Mude para -> process.env.TORBOX_API_KEY
    const TORBOX_API_KEY = "3a021657-8ac9-4bf5-b6f2-5515fc92964c"; 
    // ============================================================================

    if (!TORBOX_API_KEY) {
        return res.status(400).json({ error: 'API Key do Torbox não configurada no backend.' });
    }

    const { action, links } = req.body;
    if (!links || !Array.isArray(links) || links.length === 0) {
        return res.status(200).json({ items: [] });
    }

    const BASE_URL = "https://api.torbox.app/v1/api";
    const headers = {
        "Authorization": `Bearer ${TORBOX_API_KEY}`,
        "Content-Type": "application/json"
    };

    try {
        // ------------------------------------------------------------------------
        // AÇÃO 1: CHECAR CACHE DE TORRENTS / MAGNETS
        // ------------------------------------------------------------------------
        if (action === 'check-cache') {
            // Extrai o InfoHash dos magnet links recebidos
            const hashToOriginalUrl = {};
            const hashes = [];

            links.forEach(url => {
                // Regex para capturar o hash hex (40 chars) ou base32 (32 chars) do magnet
                const match = url.match(/urn:btih:([a-zA-Z0-9]{32,40})/i);
                if (match && match[1]) {
                    const hash = match[1].toLowerCase();
                    hashes.push(hash);
                    hashToOriginalUrl[hash] = url;
                }
            });

            if (hashes.length === 0) return res.status(200).json({ items: [] });

            // Envia requisição em bulk para o Torbox (aceita lista separada por vírgula)
            const queryHashes = hashes.join(',');
            const response = await fetch(`${BASE_URL}/torrents/checkcached?hash=${queryHashes}&format=list`, {
                method: 'GET',
                headers: headers
            });

            const data = await response.json();
            const cachedItems = [];

            // O Torbox retorna um array ou objeto com os hashes que estão em cache (true/1)
            if (data && data.success && data.data) {
                const retornados = Array.isArray(data.data) ? data.data : Object.keys(data.data);
                retornados.forEach(item => {
                    const hash = typeof item === 'string' ? item.toLowerCase() : (item.hash || '').toLowerCase();
                    if (hashToOriginalUrl[hash]) {
                        cachedItems.push({
                            label: 'TORRENT (CACHED)',
                            originalUrl: hashToOriginalUrl[hash],
                            // Manda para uma rota que adiciona o torrent no Torbox já solicitando download instantâneo
                            downloadUrl: `https://torbox.app/torrents` // Pode direcionar para o app ou integrar o create torrent depois
                        });
                    }
                });
            }

            return res.status(200).json({ items: cachedItems });
        }

        // ------------------------------------------------------------------------
        // AÇÃO 2: GERAR LINKS DIREITOS (DEBRID DE WEB DOWNLOADS)
        // ------------------------------------------------------------------------
        else if (action === 'web-download') {
            // Dispara requisições em paralelo para converter cada link de file host
            const promises = links.map(async (url) => {
                try {
                    const res = await fetch(`${BASE_URL}/webdl/create`, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({ link: url })
                    });
                    const data = await res.json();
                    
                    // Se o Torbox aceitou e gerou/iniciou o debrid do arquivo
                    if (data && data.success && data.data) {
                        const linkDireto = data.data.download_url || data.data || null;
                        if (linkDireto && typeof linkDireto === 'string') {
                            let label = 'WEB DEBRID';
                            try { label = new URL(url).hostname.replace('www.', '').toUpperCase().split('.')[0]; } catch(e){}
                            return {
                                label: `${label} ⚡`,
                                originalUrl: url,
                                downloadUrl: linkDireto
                            };
                        }
                    }
                } catch (e) {
                    console.error("Erro ao converter link no Torbox:", url, e);
                }
                return null;
            });

            const results = await Promise.all(promises);
            const validItems = results.filter(item => item !== null);

            return res.status(200).json({ items: validItems });
        }

        return res.status(400).json({ error: 'Ação inválida para o Torbox.' });

    } catch (error) {
        console.error("Erro no proxy Torbox:", error);
        return res.status(500).json({ error: 'Falha na comunicação com o Torbox.' });
    }
}