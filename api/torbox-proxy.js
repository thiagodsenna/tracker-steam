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

    const { action, links, magnet } = req.body;
    const BASE_URL = "https://api.torbox.app/v1/api";
    const headersJson = {
        "Authorization": `Bearer ${TORBOX_API_KEY}`,
        "Content-Type": "application/json"
    };

    try {
        // ------------------------------------------------------------------------
        // AÇÃO 1: CHECAR CACHE DE TORRENTS (Apenas Torrents importam agora)
        // ------------------------------------------------------------------------
        if (action === 'check-cache') {
            if (!links || !Array.isArray(links) || links.length === 0) {
                return res.status(200).json({ items: [] });
            }

            const hashToOriginalUrl = {};
            const hashes = [];

            links.forEach(url => {
                const match = url.match(/urn:btih:([a-zA-Z0-9]{32,40})/i);
                if (match && match[1]) {
                    let hash = match[1].toLowerCase();
                    if (hash.length === 32) {
                        const convertedHex = base32ToHex(hash);
                        if (convertedHex) {
                            hashToOriginalUrl[convertedHex] = url;
                            hashes.push(convertedHex);
                        }
                    }
                    hashToOriginalUrl[hash] = url;
                    if (!hashes.includes(hash)) hashes.push(hash);
                }
            });

            if (hashes.length === 0) return res.status(200).json({ items: [] });

            const queryHashes = hashes.join(',');
            const endpointUrl = `${BASE_URL}/torrents/checkcached?hash=${queryHashes}&format=list`;
            
            const response = await fetch(endpointUrl, { method: 'GET', headers: headersJson });
            const data = await response.json();
            const cachedItems = [];

            if (data && (data.success || data.data)) {
                const objData = data.data || data;
                if (Array.isArray(objData)) {
                    objData.forEach(item => {
                        const hashRetornado = (typeof item === 'string' ? item : (item.hash || '')).toLowerCase();
                        if (hashToOriginalUrl[hashRetornado]) {
                            cachedItems.push({
                                label: 'TORRENT (CACHED) ⚡',
                                magnetUrl: hashToOriginalUrl[hashRetornado]
                            });
                        }
                    });
                }
            }

            return res.status(200).json({ items: cachedItems });
        }

        // ------------------------------------------------------------------------
        // AÇÃO 2: ADICIONAR À CONTA E GERAR LINK DE DOWNLOAD AUTOMÁTICO
        // ------------------------------------------------------------------------
        else if (action === 'add-and-download') {
            if (!magnet) return res.status(400).json({ error: 'Magnet link não fornecido.' });

            // 1. Envia o Magnet usando FormData (Formato exigido pelo Torbox na criação)
            const formData = new FormData();
            formData.append("magnet", magnet);
            formData.append("seed", "1"); // Opção padrão para manter semeando
            formData.append("allow_zip", "true"); // Permite gerar ZIP se for pasta com vários arquivos

            const createRes = await fetch(`${BASE_URL}/torrents/createtorrent`, {
                method: 'POST',
                headers: { "Authorization": `Bearer ${TORBOX_API_KEY}` }, // O browser/node preenche o Content-Type do FormData com o boundary correto
                body: formData
            });

            const createData = await createRes.json();
            let torrentId = null;

            if (createData && createData.success && createData.data) {
                torrentId = createData.data.torrent_id || createData.data.id;
            }

            // Se não retornou ID (ex: já estava adicionado anteriormente na biblioteca do usuário), busca na lista
            if (!torrentId) {
                const listRes = await fetch(`${BASE_URL}/torrents/mylist`, { method: 'GET', headers: headersJson });
                const listData = await listRes.json();
                if (listData && listData.data) {
                    // Tenta achar o torrent pelo hash do magnet
                    const hashMatch = magnet.match(/urn:btih:([a-zA-Z0-9]{32,40})/i);
                    const hashAlvo = hashMatch ? hashMatch[1].toLowerCase() : "";
                    
                    const torrentEncontrado = listData.data.find(t => {
                        const h = (t.hash || "").toLowerCase();
                        return h === hashAlvo || h === base32ToHex(hashAlvo);
                    });

                    if (torrentEncontrado) torrentId = torrentEncontrado.id;
                }
            }

            if (!torrentId) {
                return res.status(500).json({ error: 'Falha ao processar ou localizar o torrent na sua conta Torbox.' });
            }

            // 2. Solicita o link de download direto do arquivo principal ou do ZIP gerado
            // Na API do Torbox, para pedir o download de um torrent em cache usamos o endpoint requestdl
            const dlRes = await fetch(`${BASE_URL}/torrents/requestdl?token=${TORBOX_API_KEY}&torrent_id=${torrentId}&zip_link=true`, {
                method: 'GET',
                headers: headersJson
            });

            const dlData = await dlRes.json();

            if (dlData && dlData.success && dlData.data) {
                const linkFinal = dlData.data.download_url || dlData.data;
                if (typeof linkFinal === 'string' && linkFinal.startsWith('http')) {
                    return res.status(200).json({ success: true, downloadUrl: linkFinal });
                }
            }

            return res.status(500).json({ error: 'O torrent foi adicionado, mas o link de download ainda está sendo gerado pelo Torbox.' });
        }

        return res.status(400).json({ error: 'Ação inválida.' });

    } catch (error) {
        console.error("Erro no proxy Torbox:", error);
        return res.status(500).json({ error: 'Falha na comunicação com o Torbox.', detalhe: error.message });
    }
}