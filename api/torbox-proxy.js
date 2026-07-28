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

    let logWebDebug = null; // Variável declarada corretamente para evitar erros

    try {
        // ------------------------------------------------------------------------
        // AÇÃO 1: CHECAGEM DE CACHE (Focada em Torrents, onde a API é estável)
        // ------------------------------------------------------------------------
        if (action === 'check-cache') {
            if (!links || !Array.isArray(links) || links.length === 0) {
                return res.status(200).json({ items: [] });
            }

            const cachedItems = [];
            const torrentLinks = links.filter(l => l.startsWith('magnet:') || l.endsWith('.torrent') || l.includes('btih:'));

            if (torrentLinks.length > 0) {
                const hashToOriginalUrl = {};
                const hashes = [];

                torrentLinks.forEach(u => {
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
                });

                if (hashes.length > 0) {
                    try {
                        const resTor = await fetch(`${BASE_URL}/torrents/checkcached?hash=${hashes.join(',')}&format=list`, { method: 'GET', headers: headersJson });
                        const dataTor = await resTor.json();
                        
                        logWebDebug = dataTor; // Registra o retorno para debug

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
                    } catch (e) { 
                        logWebDebug = { erro: e.message }; 
                    }
                }
            }

            return res.status(200).json({ 
                items: cachedItems,
                debug_raw: {
                    acao: "check-cache",
                    respostaTorbox: logWebDebug
                }
            });
        }

        // ------------------------------------------------------------------------
        // AÇÃO 2: ADICIONAR À NUVEM E GERAR LINK VIP
        // ------------------------------------------------------------------------
        else if (action === 'add-and-download') {
            if (!url) return res.status(400).json({ error: 'URL ou Magnet não fornecido.' });

            // --- FLUXO A: TORRENT (100% Funcional) ---
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

            // --- FLUXO B: WEB DOWNLOADS (Criação direta via createwebdl) ---
            else {
                const formData = new FormData();
                formData.append("link", url);

                const createRes = await fetch(`${BASE_URL}/webdl/createwebdl`, {
                    method: 'POST',
                    headers: { "Authorization": `Bearer ${TORBOX_API_KEY}` },
                    body: formData
                });
                const createData = await createRes.json();
                
                if (createData && (createData.success || createData.data)) {
                    // Se o Torbox aceitou e gerou o link ou iniciou
                    const resultObj = createData.data || createData;
                    const linkDireto = resultObj.download_url || resultObj.url || (typeof resultObj === 'string' ? resultObj : null);
                    
                    if (linkDireto && typeof linkDireto === 'string' && linkDireto.startsWith('http')) {
                        return res.status(200).json({ success: true, downloadUrl: linkDireto });
                    }
                }

                throw new Error(createData?.detail || 'Falha ao processar link Web no Torbox.');
            }
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