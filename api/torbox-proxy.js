// Arquivo: api/torbox-proxy.js

// Função auxiliar para converter InfoHash de Base32 (32 chars) para Hexadecimal (40 chars)
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

    const { action, links } = req.body;
    if (!links || !Array.isArray(links) || links.length === 0) {
        return res.status(200).json({ items: [], debug_raw: "Nenhum link enviado no array." });
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
            const hashToOriginalUrl = {};
            const hashes = [];

            links.forEach(url => {
                const match = url.match(/urn:btih:([a-zA-Z0-9]{32,40})/i);
                if (match && match[1]) {
                    let hash = match[1].toLowerCase();
                    
                    // Se for Base32 (32 chars), converte para Hex (40 chars) para a API aceitar
                    if (hash.length === 32) {
                        const convertedHex = base32ToHex(hash);
                        if (convertedHex) {
                            hashToOriginalUrl[convertedHex] = url;
                            hashes.push(convertedHex);
                        }
                    }
                    
                    // Mantém o hash original mapeado por segurança
                    hashToOriginalUrl[hash] = url;
                    if (!hashes.includes(hash)) hashes.push(hash);
                }
            });

            if (hashes.length === 0) {
                return res.status(200).json({ items: [], debug_raw: "Nenhum InfoHash válido extraído dos links enviados." });
            }

            const queryHashes = hashes.join(',');
            const endpointUrl = `${BASE_URL}/torrents/checkcached?hash=${queryHashes}&format=list`;
            
            const response = await fetch(endpointUrl, { method: 'GET', headers: headers });
            const statusHttp = response.status;
            const rawText = await response.text();
            
            let data = null;
            try { data = JSON.parse(rawText); } catch(e){}

            const cachedItems = [];

            // Tenta processar o retorno caso tenha tido sucesso
            if (data && (data.success || data.data)) {
                const objData = data.data || data;
                
                // Se for array de hashes ou array de objetos
                if (Array.isArray(objData)) {
                    objData.forEach(item => {
                        const hashRetornado = (typeof item === 'string' ? item : (item.hash || '')).toLowerCase();
                        // Checa se existe no nosso mapa original ou se o Torbox retornou algo similar
                        if (hashToOriginalUrl[hashRetornado]) {
                            cachedItems.push({
                                label: 'TORRENT (CACHED) ⚡',
                                originalUrl: hashToOriginalUrl[hashRetornado],
                                downloadUrl: `https://torbox.app/torrents`
                            });
                        }
                    });
                } 
                // Se for objeto onde as chaves são os hashes (Ex: { "hash123": true })
                else if (typeof objData === 'object') {
                    Object.keys(objData).forEach(hashKey => {
                        const hashRetornado = hashKey.toLowerCase();
                        const isCached = objData[hashKey];
                        
                        // Se for true ou se for um objeto com dados do torrent
                        if (isCached && hashToOriginalUrl[hashRetornado]) {
                            cachedItems.push({
                                label: 'TORRENT (CACHED) ⚡',
                                originalUrl: hashToOriginalUrl[hashRetornado],
                                downloadUrl: `https://torbox.app/torrents`
                            });
                        }
                    });
                }
            }

            // RETORNA OS ITENS E O DIAGNÓSTICO COMPLETO
            return res.status(200).json({ 
                items: cachedItems,
                debug_raw: {
                    acao: "check-cache",
                    statusHttpTorbox: statusHttp,
                    hashesEnviados: hashes,
                    respostaCompletaTorbox: data || rawText
                }
            });
        }

        // ------------------------------------------------------------------------
        // AÇÃO 2: GERAR LINKS DIREITOS (DEBRID DE WEB DOWNLOADS)
        // ------------------------------------------------------------------------
        else if (action === 'web-download') {
            const debugList = [];

            const promises = links.map(async (url) => {
                // 👇 CORREÇÃO: Endpoint correto na API v1 do Torbox é /webdl/createwebdl
                const endpointUrl = `${BASE_URL}/webdl/createwebdl`;
                const payloadBody = JSON.stringify({ link: url }); 

                try {
                    const res = await fetch(endpointUrl, {
                        method: 'POST',
                        headers: headers,
                        body: payloadBody
                    });
                    
                    const statusHttp = res.status;
                    const rawText = await res.text();
                    let data = null;
                    try { data = JSON.parse(rawText); } catch(e){}

                    // Guarda o log exato deste link para o nosso debug
                    debugList.push({
                        urlEnviada: url,
                        statusHttp: statusHttp,
                        respostaTorbox: data || rawText
                    });

                    // Verifica sucesso no retorno do Torbox
                    if (data && (data.success || data.data)) {
                        const resultObj = data.data || data;
                        const linkDireto = resultObj.download_url || resultObj.url || (typeof resultObj === 'string' ? resultObj : null);
                        
                        if (linkDireto && typeof linkDireto === 'string' && linkDireto.startsWith('http')) {
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
                    debugList.push({ urlEnviada: url, erroFetch: e.message });
                }
                return null;
            });

            const results = await Promise.all(promises);
            const validItems = results.filter(item => item !== null);

            // RETORNA OS ITENS E O DIAGNÓSTICO DE CADA LINK TESTADO
            return res.status(200).json({ 
                items: validItems,
                debug_raw: {
                    acao: "web-download",
                    totalAnalisados: links.length,
                    detalhesPorLink: debugList
                }
            });
        }

        return res.status(400).json({ error: 'Ação inválida para o Torbox.' });

    } catch (error) {
        console.error("Erro no proxy Torbox:", error);
        return res.status(500).json({ error: 'Falha na comunicação com o Torbox.', detalhe: error.message });
    }
}