// Arquivo: api/torbox-proxy.js

function base32ToHex(base32) {
    const base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    let hex = "";
    for (let i = 0; i < base32.length; i++) {
        const val = base32chars.indexOf(base32.charAt(i).toUpperCase());
        if (val === -1) return null;
        bits += val.toString(2).padStart(5, '0');
    }
    for (let i = 0; i + 4 <= bits.length; i += 4) {
        const chunk = bits.substr(i, 4);
        hex += parseInt(chunk, 2).toString(16);
    }
    return hex;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

    // ============================================================================
    // 🔑 CONFIGURAÇÃO DA API KEY DO TORBOX
    // ============================================================================
    const TORBOX_API_KEY = "3a021657-8ac9-4bf5-b6f2-5515fc92964c"; 
    // ============================================================================

    if (!TORBOX_API_KEY) {
        return res.status(400).json({ error: 'API Key do Torbox não configurada no backend.' });
    }

    const { action, links, url, type } = req.body;
    const BASE_URL = "https://api.torbox.app/v1/api";
    const headersJson = {
        "Authorization": `Bearer ${TORBOX_API_KEY}`,
        "Content-Type": "application/json"
    };

    try {
        // ------------------------------------------------------------------------
        // AÇÃO 1: VERIFICAR CACHE DE TORRENTS (Magnets / .torrent)
        // ------------------------------------------------------------------------
        if (action === 'check-cache') {
            if (!links || !Array.isArray(links) || links.length === 0) {
                return res.status(200).json({ items: [] });
            }

            const hashToOriginalUrl = {};
            const hashes = [];

            links.forEach(u => {
                if (u.startsWith('magnet:') || u.endsWith('.torrent') || u.includes('btih:')) {
                    const match = u.match(/urn:btih:([a-zA-Z0-9]{32,40})/i);
                    if (match && match[1]) {
                        let hash = match[1].toLowerCase();
                        if (hash.length === 32) {
                            const hex = base32ToHex(hash);
                            if (hex) {
                                hashToOriginalUrl[hex] = u;
                                hashes.push(hex);
                            }
                        }
                        hashToOriginalUrl[hash] = u;
                        if (!hashes.includes(hash)) hashes.push(hash);
                    }
                }
            });

            if (hashes.length === 0) {
                return res.status(200).json({ items: [], debug_raw: { acao: "check-cache", info: "Nenhum magnet válido encontrado." } });
            }

            const response = await fetch(`${BASE_URL}/torrents/checkcached?hash=${hashes.join(',')}&format=list`, { method: 'GET', headers: headersJson });
            const dataTor = await response.json();
            const cachedItems = [];

            if (dataTor && (dataTor.success || dataTor.data)) {
                const objData = dataTor.data || dataTor;
                if (Array.isArray(objData)) {
                    objData.forEach(item => {
                        const h = (typeof item === 'string' ? item : (item.hash || '')).toLowerCase();
                        if (hashToOriginalUrl[h]) {
                            cachedItems.push({
                                label: 'TORRENT (CACHED) ⚡',
                                url: hashToOriginalUrl[h],
                                type: 'torrent'
                            });
                        }
                    });
                }
            }

            return res.status(200).json({ 
                items: cachedItems,
                debug_raw: {
                    acao: "check-cache",
                    respostaTorbox: dataTor
                }
            });
        }

        // ------------------------------------------------------------------------
        // AÇÃO 2: PROCESSAR WEB DOWNLOADS (1fichier, GoFile, etc.)
        // ------------------------------------------------------------------------
        // Trecho corrigido para a Ação de Web Downloads no seu api/torbox-proxy.js
        else if (action === 'web-download') {
            if (!links || !Array.isArray(links) || links.length === 0) {
                return res.status(200).json({ items: [] });
            }

            const webLinks = links.filter(l => 
                !l.startsWith('magnet:') && 
                !l.endsWith('.torrent') && 
                !l.includes('steampowered') && 
                !l.includes('youtube') && 
                !l.includes('steamcommunity') && 
                !l.includes('skidrowreloaded')
            );

            const validItems = [];

            // Envia cada link diretamente para o endpoint de criação do Torbox
            const promises = webLinks.map(async (webUrl) => {
                try {
                    const formData = new FormData();
                    formData.append("link", webUrl);

                    const res = await fetch(`${BASE_URL}/webdl/createwebdl`, {
                        method: 'POST',
                        headers: { "Authorization": `Bearer ${TORBOX_API_KEY}` },
                        body: formData
                    });

                    const data = await res.json();

                    // Se o Torbox aceitou (seja porque estava em cache instantâneo ou porque iniciou)
                    if (data && (data.success || data.data)) {
                        const resultObj = data.data || data;
                        // Procura pelo link direto gerado na resposta
                        const linkDireto = resultObj.download_url || resultObj.url || (typeof resultObj === 'string' ? resultObj : null);

                        if (linkDireto && typeof linkDireto === 'string' && linkDireto.startsWith('http')) {
                            let label = 'WEB DEBRID';
                            try { label = new URL(webUrl).hostname.replace('www.', '').toUpperCase().split('.')[0]; } catch(e){}
                            validItems.push({
                                label: `${label} ⚡`,
                                url: webUrl,
                                downloadUrl: linkDireto,
                                type: 'webdl'
                            });
                        }
                    }
                } catch (e) {
                    console.error("Erro ao processar web download:", webUrl, e);
                }
            });

            await Promise.all(promises);

            return res.status(200).json({
                items: validItems,
                debug_raw: {
                    acao: "web-download",
                    detalhesPorLink: debugList
                }
            });
        }

        // ------------------------------------------------------------------------
        // AÇÃO 3: ADICIONAR E BAIXAR (Para cliques em botões específicos)
        // ------------------------------------------------------------------------
        else if (action === 'add-and-download') {
            if (!url) return res.status(400).json({ error: 'URL ou Magnet não fornecido.' });

            if (type === 'torrent' || url.startsWith('magnet:') || url.includes('btih:')) {
                const formData = new FormData();
                formData.append("magnet", url);
                formData.append("seed", "1");
                formData.append("allow_zip", "true");

                const createRes = await fetch(`${BASE_URL}/torrents/createtorrent`, {
                    method: 'POST',
                    headers: { "Authorization": `Bearer ${TORBOX_API_KEY}` },
                    body: formData
                });
                const createData = await createRes.json();
                let torrentId = createData?.data?.torrent_id || createData?.data?.id;

                if (!torrentId) {
                    const listRes = await fetch(`${BASE_URL}/torrents/mylist`, { method: 'GET', headers: headersJson });
                    const listData = await listRes.json();
                    if (listData && listData.data) {
                        const hashMatch = url.match(/urn:btih:([a-zA-Z0-9]{32,40})/i);
                        const hashAlvo = hashMatch ? hashMatch[1].toLowerCase() : "";
                        const enc = listData.data.find(t => (t.hash || "").toLowerCase() === hashAlvo || (t.hash || "").toLowerCase() === base32ToHex(hashAlvo));
                        if (enc) torrentId = enc.id;
                    }
                }

                if (!torrentId) throw new Error('Falha ao processar torrent na conta Torbox.');

                const dlRes = await fetch(`${BASE_URL}/torrents/requestdl?token=${TORBOX_API_KEY}&torrent_id=${torrentId}&zip_link=true`, { method: 'GET', headers: headersJson });
                const dlData = await dlRes.json();
                if (dlData?.data) {
                    const linkFinal = dlData.data.download_url || dlData.data;
                    if (typeof linkFinal === 'string' && linkFinal.startsWith('http')) return res.status(200).json({ success: true, downloadUrl: linkFinal });
                }
                throw new Error('Torrent adicionado, mas link VIP ainda em processamento.');
            }

            return res.status(400).json({ error: 'Tipo de ação inválido para add-and-download.' });
        }

        return res.status(400).json({ error: 'Ação inválida.' });

    } catch (error) {
        console.error("Erro no proxy Torbox:", error);
        return res.status(500).json({ 
            error: 'Falha na comunicação com o Torbox.', 
            detalhe: error.message,
            debug_raw: { urlEnviada: url, erroBruto: error.toString() }
        });
    }
}