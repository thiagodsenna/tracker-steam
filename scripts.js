let jogosOriginaisFeedly = [];
let jogosCarregados = [];
let termoPesquisado = '';
let fonteAtual = 'feedly'; // 'feedly' ou 'steam'
let modalJogoAtual = null;
let viewMode = localStorage.getItem('viewMode') || 'compact'; //modo de visualização padrão

// --- INÍCIO: IMPLEMENTAÇÃO DA WISHLIST (VARIÁVEIS E TOKEN) ---
let userToken = localStorage.getItem('rt_user_token');

if (!userToken) {
    userToken = 'RT-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    localStorage.setItem('rt_user_token', userToken);
}

// Tenta carregar imediatamente o cache do localStorage para evitar que pisque "0" no cabeçalho
let wishlistJogos = [];
try {
    const savedWishlist = localStorage.getItem('rt_wishlist_backup');
    if (savedWishlist) {
        wishlistJogos = JSON.parse(savedWishlist);
    }
} catch (e) {
    console.error('Erro ao ler backup local da wishlist:', e);
}
// --- FIM: IMPLEMENTAÇÃO DA WISHLIST ---

const IS_LOCAL = window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1' || 
                 window.location.protocol === 'file:';
const API_BASE_URL = IS_LOCAL ? 'https://tracker-steam.vercel.app' : '';
const STREAM_ID = 'feed%2Fhttps%2F%2Fwww.skidrowreloaded.com%2Fcategory%2Fpc-games%2Ffeed%2F';
const PROXY_BASE_URL = `${API_BASE_URL}/api/steam-proxy?action=detail&appid=`;
const CATEGORY_ICONS = {
    1: 'ico_multiPlayer.png',
    2: 'ico_singlePlayer.png',
    8: 'ico_vac.png',
    9: 'ico_coop.png',
    13: 'ico_captions.png',
    14: 'ico_commentary.png',
    15: 'ico_stats.png',
    17: 'ico_editor.png',
    18: 'ico_partial_controller.png',
    20: 'ico_mmo.png',
    22: 'ico_achievements.png',
    23: 'ico_cloud.png',
    24: 'ico_multiPlayer.png',
    25: 'ico_leaderboards.png',
    27: 'ico_multiPlayer.png',
    28: 'ico_controller.png',
    29: 'ico_cards.png',
    30: 'ico_workshop.png',
    31: 'ico_vr.png',
    32: 'ico_multiPlayer.png',
    35: 'ico_cart.png',
    36: 'ico_multiPlayer.png',
    37: 'ico_multiPlayer.png',
    38: 'ico_coop.png',
    39: 'ico_coop.png',
    41: 'ico_remote_play.png',
    42: 'ico_remote_play.png',
    43: 'ico_remote_play.png',
    44: 'ico_remote_play_together.png',
    47: 'ico_multiPlayer.png',
    48: 'ico_coop.png',
    49: 'ico_multiPlayer.png',
    51: 'ico_workshop.png',
    55: 'ico_controller.png',
    56: 'ico_controller.png',
    57: 'ico_controller.png',
    58: 'ico_controller.png',
    59: 'ico_controller.png',
    60: 'ico_controller.png',
    61: 'ico_hdr.png',
    62: 'ico_familysharing.png',
};


const delay = ms => new Promise(res => setTimeout(res, ms));

function renderizarDesenvolvedores(developers) {
    if (!developers?.length) return '';

    const label = developers.length > 1 ? 'Estúdios' : 'Estúdio';
    const primeiro = developers[0];
    const ocultos = developers.length - 1;

    if (ocultos === 0) {
        return `<span class="text-neutral-500 text-[11px]">${label}:</span> ${primeiro}`;
    }

    const todos = developers.join(', ');
    return `<span class="text-neutral-500 text-[11px]">${label}:</span> <span id="dev-list">${primeiro}</span> <button type="button" id="dev-expand-btn" class="text-emerald-400 hover:text-emerald-300 font-bold cursor-pointer">[+${ocultos}]</button>`;
}

function configurarExpandirDesenvolvedores(developers) {
    document.getElementById('dev-expand-btn')?.addEventListener('click', function () {
        const devList = document.getElementById('dev-list');
        if (devList) devList.textContent = developers.join(', ');
        this.remove();
    });
}

function getMetacriticColor(score) {
    if (score >= 80) return { bg: 'bg-green-600', border: 'border-green-400', text: 'text-green-600' };
    if (score >= 70) return { bg: 'bg-yellow-500', border: 'border-yellow-300', text: 'text-yellow-500' };
    if (score >= 50) return { bg: 'bg-yellow-600', border: 'border-yellow-400', text: 'text-yellow-600' };
    if (score >= 35) return { bg: 'bg-orange-500', border: 'border-orange-300', text: 'text-orange-500' };
    return { bg: 'bg-red-600', border: 'border-red-400', text: 'text-red-600' };
}

function formatarTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000); // Converte segundos para milissegundos
    const dia = String(date.getDate()).padStart(2, '0');
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const mes = meses[date.getMonth()];
    const ano = date.getFullYear();
    return `${dia} ${mes}, ${ano}`;
}

function formatarDataRelativa(dataString) {
    if (!dataString) return '';

    let dataPost;
    const str = String(dataString).trim();

    // 1. Mapeamento Unificado de Meses (Inglês e Português)
    const mesesMap = {
        'jan': 0, 'feb': 1, 'fev': 1, 'mar': 2, 'apr': 3, 'abr': 3,
        'may': 4, 'mai': 4, 'jun': 5, 'jul': 6, 'aug': 7, 'ago': 7,
        'sep': 8, 'set': 8, 'oct': 9, 'out': 9, 'nov': 10, 'dec': 11, 'dez': 11
    };

    // REGEX 1: Novo padrão da Steam BR (Ex: "25/fev./2016" ou "25/fev/2016")
    const matchBR = str.match(/^(\d{1,2})\/([a-zA-Z]{3})\.?\/(\d{4})$/i);

    // REGEX 2: Padrão antigo em inglês (Ex: "Feb 25, 2016")
    const matchEN = str.match(/^([a-zA-Z]{3})\s(\d{1,2}),\s(\d{4})$/i);

    if (matchBR) {
        const dia = parseInt(matchBR[1], 10);
        const mesStr = matchBR[2].toLowerCase();
        const ano = parseInt(matchBR[3], 10);
        const mes = mesesMap[mesStr] !== undefined ? mesesMap[mesStr] : 0;
        dataPost = new Date(ano, mes, dia);
    } else if (matchEN) {
        const mesStr = matchEN[1].toLowerCase();
        const dia = parseInt(matchEN[2], 10);
        const ano = parseInt(matchEN[3], 10);
        const mes = mesesMap[mesStr] !== undefined ? mesesMap[mesStr] : 0;
        dataPost = new Date(ano, mes, dia);
    } else {
        // Fallback para datas ISO padrão ou timestamps passados como string
        dataPost = new Date(dataString);
    }

    if (isNaN(dataPost.getTime())) return dataString; // Fallback caso falhe no parse

    const hoje = new Date();
    
    // Zera as horas para comparar apenas os dias
    const d1 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const d2 = new Date(dataPost.getFullYear(), dataPost.getMonth(), dataPost.getDate());
    const diffTempo = d1 - d2;
    const diffDias = Math.floor(diffTempo / (1000 * 60 * 60 * 24));
    
    if (diffDias === 0) return 'Hoje';
    if (diffDias === 1) return 'Ontem';
    if (diffDias === -1) return 'Amanhã';
    if (diffDias < -1 && diffDias >= -30) return `Em ${Math.abs(diffDias)} dias`;
    if (diffDias < 30) return `Há ${diffDias} dias`;
    
    const diffMeses = Math.floor(diffDias / 30);
    if (diffMeses <= -1) return `Em ${Math.abs(diffMeses)} ${diffMeses === -1 ? 'mês' : 'meses'}`;
    if (diffMeses < 12) return `Há ${diffMeses} ${diffMeses === 1 ? 'mês' : 'meses'}`;

    return dataString;
}

function mapearRelease(stringEntrada) {
    // Regra de identificação da versão (v0.0 ou Build 0000)
    const regexVersao = /\b(v\d+[^- ]*|Build \d+\b)/i;
    const match = stringEntrada.match(regexVersao);
    
    let tituloOriginal = "";
    let versao = "";
    let resto = "";

    if (match) {
        // CASO 1: Possui versão
        versao = match[0];
        const indiceVersao = match.index;
        tituloOriginal = stringEntrada.slice(0, indiceVersao).trim();
        resto = stringEntrada.slice(indiceVersao + versao.length);
    } else {
        // CASO 2: Não possui versão (usa o ÚLTIMO hífen como início da tag)
        const ultimoIndiceHifen = stringEntrada.lastIndexOf('-');
        if (ultimoIndiceHifen !== -1) {
            tituloOriginal = stringEntrada.slice(0, ultimoIndiceHifen).trim();
            resto = stringEntrada.slice(ultimoIndiceHifen);
        } else {
            tituloOriginal = stringEntrada.trim();
            resto = "";
        }
    }
    
    // Processamento do resto para capturar a tag após o último hífen
    let tags = [];
    if (resto) {
        const parteLimpa = resto.replace(/^-+/, '').trim(); // Remove o hífen inicial e espaços
        const primeiraPalavra = parteLimpa.split(' ')[0].trim();
        if (primeiraPalavra) {
            tags.push(primeiraPalavra);
        }
    }

    // GARANTIR "Early Access" COMO TAG
    const contemEarlyAccess = /early access/i.test(stringEntrada);

    if (contemEarlyAccess) {
        // 1. Se estiver no título, remove e limpa espaços/hífens órfãos que sobrarem
        tituloOriginal = tituloOriginal
            .replace(/early access/i, '')
            .replace(/\s+/g, ' ')   // Remove espaços duplos internos
            .replace(/[- ]+$/, '')   // Remove hífens ou espaços que sobrarem no fim
            .replace(/^[- ]+/, '')   // Remove hífens ou espaços que sobrarem no início
            .trim();

        // 2. Remove qualquer variação antiga ou parcial das tags ("early access", "early", "access") para evitar duplicatas
        tags = tags.filter(tag => !["early access", "early", "access"].includes(tag.toLowerCase()));
        
        // 3. Adiciona o termo padronizado como Tag
        tags.push("Early Access");
    }
    // ==========================================
        
    return {
        tituloOriginal,
        versao,
        tags
    };
}

// --- INÍCIO: GESTÃO DE CONFIGURAÇÕES DO USUÁRIO E ITENS NOVOS (BLINDAGEM 2H) ---
let configuracoesUsuario = {};

async function carregarConfiguracoesServidor() {
    try {
        //Utiliza a variável global userToken ou a chave correta do localStorage
        const token = typeof userToken !== 'undefined' ? userToken : localStorage.getItem('rt_user_token'); 
        if (!token) return {};
        
        const res = await fetch(`${API_BASE_URL}/api/settings?token=${encodeURIComponent(token)}`);
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.error("Erro ao carregar configurações do servidor:", e);
    }
    return {};
}

async function salvarConfiguracoesServidor(novasConfiguracoes) {
    try {
        // Utiliza a variável global userToken ou a chave correta do localStorage
        const token = typeof userToken !== 'undefined' ? userToken : localStorage.getItem('rt_user_token');
        if (!token) return;

        // Atualização otimista em memória
        configuracoesUsuario = { ...configuracoesUsuario, ...novasConfiguracoes };

        // Salva um backup local para reflexão instantânea em F5 sem depender de espera de rede
        localStorage.setItem('rt_settings_backup', JSON.stringify(configuracoesUsuario));

        await fetch(`${API_BASE_URL}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, ...novasConfiguracoes })
        });
    } catch (e) {
        console.error("Erro ao salvar configurações no servidor:", e);
    }
}

function getUltimoAcesso() {
    // Retorna o timestamp de referência que define o que ganha a tag NOVO
    if (configuracoesUsuario.last_visit !== undefined) {
        return parseInt(configuracoesUsuario.last_visit, 10) || 0;
    }
    // Fallback instantâneo para o backup local caso a API de configurações ainda esteja respondendo
    const backupLocal = localStorage.getItem('rt_settings_backup');
    if (backupLocal) {
        try {
            const parsed = JSON.parse(backupLocal);
            return parseInt(parsed.last_visit, 10) || 0;
        } catch (e) {}
    }
    return 0;
}

function atualizarUltimoAcessoServidor(jogos) {
    if (!jogos || jogos.length === 0) return;
    
    const agora = Date.now();
    const duasHorasMs = 2 * 60 * 60 * 1000;
    const maxFeedTimestamp = Math.max(...jogos.map(j => j.published || 0));

    const backupLocal = localStorage.getItem('rt_settings_backup');
    let conf = { ...configuracoesUsuario };
    if (!conf.last_visit && backupLocal) {
        try { conf = { ...JSON.parse(backupLocal), ...conf }; } catch(e){}
    }

    const lastVisitAtual = parseInt(conf.last_visit, 10) || 0;
    const shieldExpires = parseInt(conf.shield_expires, 10) || 0;
    const pendingVisit = parseInt(conf.pending_visit, 10) || 0;

    if (agora > shieldExpires) {
        let novoLastVisit = pendingVisit > 0 ? pendingVisit : lastVisitAtual;
        
        // --- CORREÇÃO 1: Milissegundos no fallback de 24 horas (24 * 60 * 60 * 1000) ---
        if (novoLastVisit === 0 && maxFeedTimestamp > 0) {
            novoLastVisit = maxFeedTimestamp - (24 * 60 * 60 * 1000);
        }

        // --- CORREÇÃO 2: Trava anti-regressão temporal ---
        // Garante que o last_visit NUNCA regrida para um timestamp mais antigo do que já era
        novoLastVisit = Math.max(novoLastVisit, lastVisitAtual);

        const novoShieldExpires = agora + duasHorasMs;
        const novoPendingVisit = Math.max(maxFeedTimestamp, novoLastVisit);

        salvarConfiguracoesServidor({
            last_visit: novoLastVisit,
            shield_expires: novoShieldExpires,
            pending_visit: novoPendingVisit
        });
    } else {
        // Trava anti-regressão para o pending_visit durante a blindagem ativa
        if (maxFeedTimestamp > pendingVisit && maxFeedTimestamp > lastVisitAtual) {
            salvarConfiguracoesServidor({
                pending_visit: maxFeedTimestamp
            });
        }
    }
}

function isJogoNovo(jogo) {
    if (fonteAtual !== 'feedly') return false; 
    const ultimoAcesso = getUltimoAcesso();
    return ultimoAcesso > 0 && (jogo.published || 0) > ultimoAcesso;
}
// --- FIM: GESTÃO DE CONFIGURAÇÕES DO USUÁRIO E ITENS NOVOS (BLINDAGEM 2H) ---

function parseFeedlyItem(item, index) {
    const doc = new DOMParser().parseFromString(item.content?.content || item.summary?.content || '', 'text/html');
    
    // Seleciona todas as imagens do post HTML
    const imagens = Array.from(doc.querySelectorAll('img'));

    // Filtra logos do tema, avatares ou ícones do Skidrow
    const capaValida = imagens.find(img => {
        const src = img.src.toLowerCase();
        return !src.includes('logo') && 
               !src.includes('theme') && 
               !src.includes('header') && 
               !src.includes('avatar') &&
               !src.includes('steamstatic'); // Ignora as screenshots de 1080p da Steam no Feedly
    });

    const imgDoDoc = capaValida?.src || doc.querySelector('img')?.src;
    const rawImg = imgDoDoc || item.visual?.url || '';
    
    // Garante que qualquer imagem extraída da postagem passe pelo cover-proxy
    let img = rawImg;
    if (rawImg && rawImg.startsWith('http')) {
        img = `${API_BASE_URL}/api/cover-proxy?url=${encodeURIComponent(rawImg)}`;
    }

    const textContent = doc.body.textContent || '';
    const sizeMatch = textContent.match(/Size:\s*([\d.,]+\s*[a-zA-Z]+)/i);
    const size = sizeMatch ? sizeMatch[1].trim() : '...';

    let downloads = [];
    doc.querySelectorAll('a').forEach(a => {
        const href = a.href || '';
        if (href.includes('skidrowreloaded') || href.includes('steampowered') || href.includes('youtube') || href.includes('steamcommunity')) return;
        if (a.textContent.length > 2 && downloads.length < 30) {
            let label = href.startsWith('magnet:') ? 'TORRENT' : new URL(a.href).hostname.replace('www.', '').toUpperCase().split('.')[0];
            downloads.push({ label: label, url: a.href });
        }
    });

    const rawHtml = item.content?.content || item.summary?.content || '';
    const steamMatch = rawHtml.match(/(?:store\.steampowered\.com|steamcommunity\.com)\/app\/(\d+)/i) 
                    || textContent.match(/(?:store\.steampowered\.com|steamcommunity\.com)\/app\/(\d+)/i);
    const steamId = item.resolvedSteamId || (steamMatch ? steamMatch[1] : null);
    const postLink = item.alternate?.[0]?.href || '#';
    const release = mapearRelease(item.title);

    const links = [
        { label: 'Atualizações', url: `https://store.steampowered.com/newshub/?appids=${steamId}` },
        { label: 'Discussões', url: `https://steamcommunity.com/app/${steamId}/discussions/` },
        { label: 'Skidrow', url: postLink },
        { label: 'Steam', url: `https://store.steampowered.com/app/${steamId}` },
    ];

    return {
        id: index,
        feedlyId: item.id,
        title: item.title,
        cover: img,
        rawCover: rawImg,
        postLink: postLink,
        downloads,
        date: formatarDataRelativa(item.published),
        published: item.published || 0,
        steamId: steamId,
        links,
        size: size,
        release,
        steamDetails: item.steamDetails || null
    };
}

function criarCardJogo(jogo) {
    const card = document.createElement('div');
    const isNew = isJogoNovo(jogo);
    
    // Borda e efeito do card padronizados com as alterações manuais do card compacto
    card.className = `bg-neutral-900 border ${isNew ? 'border-emerald-800/50' : 'border-neutral-800'} rounded-lg overflow-hidden cursor-pointer relative hover:border-emerald-500/50 transition-all`;
    card.onclick = () => abrirModal(jogosCarregados.findIndex(j => j.feedlyId === jogo.feedlyId));
    
    const fallbackFinal = jogo.fallbackImage || (jogo.steamId ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${jogo.steamId}/header.jpg` : 'https://store.fastly.steamstatic.com/public/images/v6/app_default_header.jpg');
    
    const removeBtnHtml = fonteAtual === 'wishlist' ? `
        <button onclick="removerDaWishlist('${jogo.feedlyId}', event)" title="Remover da Wishlist" class="absolute top-2 left-2 z-20 bg-black/80 hover:bg-red-600/90 text-neutral-300 hover:text-white p-1.5 rounded-full transition-all shadow-md">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
    ` : '';

    // 1) Tag NOVO (Canto Superior Direito da Capa)
    const tagNovoHtml = isNew ? `
        <span class="absolute top-0 right-0 z-20 bg-neutral-900 text-neutral-250 font-rajdhani font-black text-[12px] sm:text-[9px] px-2.5 py-1.5 pb-[4px] shadow-md tracking-wider uppercase">NOVO</span>
    ` : '';

    // 2) Badge de Nota (Canto Superior Esquerdo da Capa - Estilo Destaque/Rajdhani)
    let notaBadgeHtml = '';
    if (jogo.steamDetails && jogo.steamDetails.rating > 0) {
        const cores = getMetacriticColor(jogo.steamDetails.rating);
        notaBadgeHtml = `
            <div title="Nota Steam: ${jogo.steamDetails.rating}" class="absolute top-0 left-0 z-20 flex h-19 w-10 sm:h-6 sm:w-7 items-center justify-center rounded-[4px] border ${cores.border} ${cores.bg} shadow-md">
                <span class="font-rajdhani font-black text-[20px] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">${jogo.steamDetails.rating}</span>
            </div>
        `;
    }

    // 3) Construção das Badges Informativas (Ícones text-emerald-700 e gap-1.5)
    let badges = [];

    // Versão (Ícone Tag)
    if (jogo.release.versao) {
        badges.push(`<span title="Versão" class="inline-flex items-center gap-1.5 bg-neutral-950 border border-neutral-800 px-1.5 py-1 rounded text-[10px] text-neutral-300 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-700 shrink-0"><path d="M12 2H2v10l11 11 10-10L12 2z"/><circle cx="7" cy="7" r="2"/></svg>${jogo.release.versao}</span>`);
    }

    // Tamanho (Ícone Download)
    if (jogo.size && jogo.size !== '...') {
        badges.push(`<span title="Tamanho" class="inline-flex items-center gap-1.5 bg-neutral-950 border border-neutral-800 px-1.5 py-1 rounded text-[10px] text-neutral-300 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-700 shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>${jogo.size}</span>`);
    }

    if (jogo.steamDetails) {
        // Avaliações (Ícone Comentários Proporcional)
        if (jogo.steamDetails.total_reviews > 0) {
            const revCount = jogo.steamDetails.total_reviews > 1000 ? `${(jogo.steamDetails.total_reviews/1000).toFixed(1)}k` : jogo.steamDetails.total_reviews;
            badges.push(`<span title="Avaliações" class="inline-flex items-center gap-1.5 bg-neutral-950 border border-neutral-800 px-1.5 py-1 rounded text-[10px] text-neutral-300 font-semibold"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-700 shrink-0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>${revCount}</span>`);
        }
        // Lançamento (Ícone Calendário)
        if (jogo.steamDetails.release_date?.date) {
            badges.push(`<span title="Lançamento" class="inline-flex items-center gap-1.5 bg-neutral-950 border border-neutral-800 px-1.5 py-1 rounded text-[10px] text-neutral-300 font-semibold truncate"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-700 shrink-0"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${formatarDataRelativa(jogo.steamDetails.release_date.date)}</span>`);
        }
    }

    let metadadosHtml = '';
    if (badges.length > 0) {
        metadadosHtml = `<div class="flex flex-wrap items-center gap-1.5 mt-2">${badges.join('')}</div>`;
    }

    card.innerHTML = `
        <div class="aspect-[3/4] bg-neutral-950 relative overflow-hidden">
            ${tagNovoHtml}
            ${removeBtnHtml}
            ${notaBadgeHtml}
            <img src="${jogo.cover}" 
                 referrerpolicy="no-referrer" 
                 onerror="
                   if (this.src !== '${jogo.rawCover}' && '${jogo.rawCover}' !== '') {
                       this.src = '${jogo.rawCover}';
                   } else if (this.src !== '${fallbackFinal}') {
                       this.src = '${fallbackFinal}';
                   } else {
                       this.onerror = null;
                   }
                 " 
                 class="w-full h-full object-cover">
        </div>
        <div class="p-2">
            <div class="font-bold text-xs line-clamp-2 text-neutral-200" title="${jogo.title}">${jogo.title}</div>
            ${metadadosHtml}
        </div>
    `;
    return card;
}

function criarCardJogoCompacto(jogo) {
    const card = document.createElement('div');
    const isNew = isJogoNovo(jogo);

    card.className = `bg-neutral-900 border ${isNew ? 'border-emerald-800/50' : 'border-neutral-800'} rounded-md overflow-hidden cursor-pointer relative transition-all p-2.5 flex gap-3 sm:gap-4 w-full group/card`;
    card.onclick = () => abrirModal(jogosCarregados.findIndex(j => j.feedlyId === jogo.feedlyId));
    
    const fallbackFinal = jogo.fallbackImage || (jogo.steamId ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${jogo.steamId}/header.jpg` : 'https://store.fastly.steamstatic.com/public/images/v6/app_default_header.jpg');
    
    const removeBtnHtml = fonteAtual === 'wishlist' ? `
        <button onclick="removerDaWishlist('${jogo.feedlyId}', event)" title="Remover da Wishlist" class="absolute bottom-2.5 right-2.5 text-neutral-500 hover:text-red-400 p-1.5 rounded-md hover:bg-neutral-800 transition-colors z-20">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
    ` : '';

    // Tag NOVO (Canto Superior Direito)
    const tagNovoHtml = isNew ? `
        <span class="absolute top-0 left-0 z-20 bg-emerald-900 text-neutral-250 font-rajdhani font-black text-[9px] sm:text-[9px] px-1.5 py-0.5 pb-[1px] shadow-md tracking-wider uppercase">NOVO</span>
    ` : '';

    // Badge de Nota (Canto Superior Esquerdo)
    let notaBadgeCoverHtml = '';
    let notaBadgeTituloHtml = '';
    /* if (jogo.steamDetails && jogo.steamDetails.rating > 0) {
        const cores = getMetacriticColor(jogo.steamDetails.rating);
        notaBadgeCoverHtml = `
            <div title="Nota Steam: ${jogo.steamDetails.rating}" class="absolute top-0 left-0 z-20 flex h-5 w-6 sm:h-6 sm:w-7 items-center justify-center rounded-[4px] border ${cores.border} ${cores.bg} shadow-md">
                <span class="font-rajdhani font-black text-[12px] sm:text-[12px] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">${jogo.steamDetails.rating}</span>
            </div>
        `;
        notaBadgeTituloHtml = `
            <div title="Nota Steam: ${jogo.steamDetails.rating}" class="inline-flex px-1 py-[1px] sm:h-6 sm:w-7 items-center justify-center rounded-[4px] border ${cores.border} ${cores.bg} shadow-md">
                <span class="font-rajdhani font-black text-[10px] sm:text-[11px] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">${jogo.steamDetails.rating}</span>
            </div>
        `;
    } */

    let tagsHtml = '';
    if (jogo.release.tags && jogo.release.tags.length > 0) {
        tagsHtml = jogo.release.tags.map(tag => `
            <span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] sm:text-[10px] font-semibold px-1 py-0.5 rounded shadow-sm block mb-1">
                ${tag.toUpperCase()}
            </span>`).join('');
    }

    // 1) Ícone de Versão (com shrink-0 para não espremer)
    let versaoCompactoHtml = '';
    if (jogo.release.versao) {
        versaoCompactoHtml = `<span title="Versão" class="inline-flex items-center gap-1.5 bg-neutral-950/80 border border-neutral-800/80 px-1.5 py-1 rounded text-[10px] sm:text-[11px] text-neutral-400 font-semibold shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-700 shrink-0"><path d="M12 2H2v10l11 11 10-10L12 2z"/><circle cx="7" cy="7" r="2"/></svg>${jogo.release.versao}</span>`;
    }

    // 2) Ícone de Tamanho (com shrink-0)
    let tamanhoCompactoHtml = `<span title="Tamanho" class="inline-flex items-center gap-1.5 bg-neutral-950/80 border border-neutral-800/80 px-1.5 py-1 rounded text-[10px] sm:text-[11px] text-neutral-400 font-semibold shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-700 shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>${jogo.size}</span>`;

    let revCompactoHtml = '';
    let lancCompactoHtml = '';
    let notaCompactoHtml = '';

    if (jogo.steamDetails) {
        // 3) Ícone de Avaliações (com shrink-0)
        if (jogo.steamDetails.total_reviews > 0) {
            const revCount = jogo.steamDetails.total_reviews > 1000 ? `${(jogo.steamDetails.total_reviews/1000).toFixed(1)}k` : jogo.steamDetails.total_reviews;
            revCompactoHtml = `<span title="Avaliações" class="inline-flex items-center gap-1.5 bg-neutral-950/80 border border-neutral-800/80 px-1.5 py-1 rounded text-[10px] sm:text-[11px] text-neutral-400 font-semibold shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-700 shrink-0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>${revCount}</span>`;
        }
        // 4) Ícone de Lançamento (sem limite máximo e com shrink-0 / whitespace-nowrap)
        if (jogo.steamDetails.release_date?.date) {
            lancCompactoHtml = `<span title="Lançamento" class="inline-flex items-center gap-1.5 bg-neutral-950/80 border border-neutral-800/80 px-1.5 py-1 rounded text-[10px] sm:text-[11px] text-neutral-400 font-semibold shrink-0 whitespace-nowrap"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-700 shrink-0"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${formatarDataRelativa(jogo.steamDetails.release_date.date)}</span>`;
        }

        // 5) Nota compacta
        if (jogo.steamDetails?.rating) {
            const corNota = getMetacriticColor(jogo.steamDetails.rating);
            notaCompactoHtml = `<span title="Nota" class="inline-flex items-center gap-1.5 bg-neutral-950/80 border border-neutral-800/80 px-1.5 py-1 rounded text-[10px] sm:text-[11px] text-neutral-400 font-semibold shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-700 shrink-0"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>${jogo.steamDetails.rating}%</span>`;
        }
    }

    let html = `
        <div class="w-16 h-24 sm:w-[88px] sm:h-32 shrink-0 bg-neutral-950 rounded overflow-hidden relative border border-neutral-950">
            ${notaBadgeCoverHtml}
            ${tagNovoHtml}
            <img src="${jogo.cover}" 
                 referrerpolicy="no-referrer" 
                 onerror="if (this.src !== '${jogo.rawCover}' && '${jogo.rawCover}' !== '') { this.src = '${jogo.rawCover}'; } else if (this.src !== '${fallbackFinal}') { this.src = '${fallbackFinal}'; } else { this.onerror = null; }" 
                 class="w-full h-full object-cover">
        </div>
        <div class="flex flex-col justify-between min-w-0 flex-1 relative py-0 pr-1">
            <div class="w-full pr-12">
                ${notaBadgeTituloHtml}
                <div class="font-rajdhani font-bold text-[16px] sm:text-lg text-white tracking-tight leading-tight" title="${jogo.title}">
                    ${jogo.release.tituloOriginal.toUpperCase()}
                </div>
            </div>
            <!-- Container das badges em linha única com scrollbar customizado no hover -->
            <div class="flex items-center gap-1 sm:gap-2 mt-2 sm:mt-3 w-full overflow-x-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden group-hover/card:[scrollbar-width:thin] group-hover/card:[scrollbar-color:theme(colors.neutral.800)_transparent] group-hover/card:[&::-webkit-scrollbar]:block group-hover/card:[&::-webkit-scrollbar]:h-[1px] group-hover/card:[&::-webkit-scrollbar-track]:bg-transparent group-hover/card:[&::-webkit-scrollbar-thumb]:bg-neutral-800 group-hover/card:[&::-webkit-scrollbar-thumb]:rounded-full">
                ${notaCompactoHtml}
                ${revCompactoHtml}
                ${versaoCompactoHtml}
                ${tamanhoCompactoHtml}
                ${lancCompactoHtml}
            </div>
        </div>
        ${tagsHtml ? `<div class="absolute top-2.5 right-2.5 flex flex-col items-end z-10">${tagsHtml}</div>` : ''}
        ${removeBtnHtml}
    `;

    card.innerHTML = html;
    return card;
}

function atualizarVisibilidadeDestaque() {
    const sec = document.getElementById('featured-section');
    const globalBg = document.getElementById('global-featured-bg');
    if (!sec) return;
    const deveExibir = destaqueAtualObj !== null && fonteAtual === 'feedly' && !termoPesquisado;

    if (deveExibir) {
        sec.classList.remove('hidden');
        if (globalBg && globalBg.style.backgroundImage) {
            globalBg.classList.remove('hidden');
        }
    } else {
        sec.classList.add('hidden');
        if (globalBg) {
            globalBg.classList.add('hidden');
        }
    }
}

async function buscarItemFeedlyRemoto(feedlyId) {
    const res = await fetch(`${API_BASE_URL}/api/feedly-proxy?action=entry&id=${encodeURIComponent(feedlyId)}`);
    if (!res.ok) return null;
    return res.json();
}

async function processarDeepLink() {
    const sharedId = new URLSearchParams(window.location.search).get('id');
    if (!sharedId) return;

    let index = encontrarJogoPorFeedlyId(sharedId);
    if (index >= 0) {
        abrirModal(index, { fromDeepLink: true });
        return;
    }

    const grid = document.getElementById('grid');
    grid.insertAdjacentHTML('afterbegin',
        '<div id="deep-link-loading" class="col-span-full text-center py-6 text-emerald-500 animate-pulse text-sm">Carregando jogo compartilhado...</div>'
    );

    try {
        const item = await buscarItemFeedlyRemoto(sharedId);
        document.getElementById('deep-link-loading')?.remove();

        if (!item) {
            grid.insertAdjacentHTML('afterbegin',
                '<div class="col-span-full text-center py-6 text-amber-400 text-sm">Jogo compartilhado não encontrado ou indisponível.</div>'
            );
            return;
        }

        const jogo = parseFeedlyItem(item, jogosCarregados.length);
        jogosCarregados.push(jogo);
        const card = viewMode === 'compact' ? criarCardJogoCompacto(jogo) : criarCardJogo(jogo);
        grid.prepend(card);
        abrirModal(jogo.id, { fromDeepLink: true });
    } catch (err) {
        console.error('Erro ao carregar deep link:', err);
        document.getElementById('deep-link-loading')?.remove();
        grid.insertAdjacentHTML('afterbegin',
            '<div class="col-span-full text-center py-6 text-red-400 text-sm">Erro ao carregar o jogo compartilhado.</div>'
        );
    }
}

function setViewMode(mode) {
    viewMode = mode;
    localStorage.setItem('viewMode', mode);
    updateViewButtons();
    renderizarJogos();
}

function updateViewButtons() {
    const btnCovers = document.getElementById('btn-view-covers');
    const btnCompact = document.getElementById('btn-view-compact');
    if (!btnCovers || !btnCompact) return;

    // Remove o foco nativo do elemento ao tocar no mobile
    btnCovers.blur();
    btnCompact.blur();

    const isCompact = viewMode === 'compact';
    const activeBtn = isCompact ? btnCompact : btnCovers;
    const inactiveBtn = isCompact ? btnCovers : btnCompact;

    // 1. Configura o BOTÃO ATIVO (Força verde no estado normal, no hover e no focus)
    activeBtn.classList.remove('text-neutral-400', 'hover:text-white', 'focus:text-white', 'active:text-white');
    activeBtn.classList.add('bg-neutral-800', 'text-emerald-500', 'hover:text-emerald-400', 'focus:text-emerald-500');

    // 2. Configura o BOTÃO INATIVO (Volta ao cinza normal com hover branco)
    inactiveBtn.classList.remove('bg-neutral-800', 'text-emerald-500', 'hover:text-emerald-400', 'focus:text-emerald-500');
    inactiveBtn.classList.add('text-neutral-400', 'hover:text-white');

    // 3. Garante que se o ícone SVG interno tiver classes de cor próprias, elas não sobrescrevam
    [btnCovers, btnCompact].forEach(btn => {
        const svg = btn.querySelector('svg');
        if (svg) {
            svg.classList.remove('text-white', 'hover:text-white', 'focus:text-white');
        }
    });
}

function renderizarJogos() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    
    // Oculta/Exibe o destaque dependendo da tela atual
    atualizarVisibilidadeDestaque();

    grid.innerHTML = '';

    // --- CHECAGEM DE WISHLIST VAZIA ---
    if (jogosCarregados.length === 0) {
        if (fonteAtual === 'wishlist') {
            grid.innerHTML = '<div class="col-span-full text-center py-20 text-neutral-500 text-sm">Sua Wishlist está vazia no momento.<br><span class="text-xs text-neutral-600">Adicione jogos acessando os detalhes de qualquer release.</span></div>';
            return;
        }
    }

    if (viewMode === 'compact') {
        grid.className = 'grid grid-cols-1 gap-3';
    } else {
        grid.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6';
    }

    jogosCarregados.forEach(jogo => {
        const card = viewMode === 'compact' ? criarCardJogoCompacto(jogo) : criarCardJogo(jogo);
        grid.appendChild(card);
    });
}

async function carregarJogos() {
    const grid = document.getElementById('grid');
    jogosCarregados = [];
    grid.innerHTML = '<div class="col-span-full text-center py-20 text-emerald-500 animate-pulse">Carregando releases...</div>';
    
    updateViewButtons();
    // --- INÍCIO: CARREGAMENTO DE DADOS DA WISHLIST ---
    verificarTokenSincroniaURL();
    carregarWishlistDoServidor();
    // --- FIM: CARREGAMENTO DE DADOS DA WISHLIST ---

    try {
       // Dispara em paralelo a busca do feed de jogos E a busca das configurações do servidor
        const [resJogos, configServidor] = await Promise.all([
            fetch(`${API_BASE_URL}/api/feedly-proxy?action=list`),
            carregarConfiguracoesServidor()
        ]);

        // Salva na variável global para ser usada pelas funções de verificação
        configuracoesUsuario = configServidor || {};

        const data = await resJogos.json();

        // 1º: Primeiro preenchemos a lista de jogos em memória
        data.items.forEach((item, index) => {
            const jogo = parseFeedlyItem(item, index);
            jogosCarregados.push(jogo);
        });

        jogosOriginaisFeedly = [...jogosCarregados];

        // 2º: Agora sim renderizamos o destaque, pois ele precisará cruzar dados com jogosCarregados
        if (data.destaques) {
            renderizarDestaque(data.destaques);
        }

        // Envia o novo timestamp para o servidor em segundo plano (não bloqueia a renderização)
        atualizarUltimoAcessoServidor(jogosCarregados);

        renderizarJogos();
        await processarDeepLink();

    } catch (err) {
        console.error("Erro Feedly:", err);
        grid.innerHTML = `<div class="col-span-full text-red-500 text-center py-20">Erro ao carregar feeds.</div>`;
        await processarDeepLink();
    }
}

function encontrarJogoPorFeedlyId(feedlyId) {
    return jogosCarregados.findIndex(j => j.feedlyId === feedlyId);
}

function getShareUrl(feedlyId) {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('id', feedlyId);
    return url.toString();
}

async function copiarLink(texto) {
    try {
        await navigator.clipboard.writeText(texto);
        alert('Link copiado!');
    } catch {
        prompt('Copie o link:', texto);
    }
}

async function compartilharJogoAtual() {
    const jogo = modalJogoAtual !== null ? jogosCarregados[modalJogoAtual] : null;
    if (!jogo) return;

    const shareUrl = getShareUrl(jogo.feedlyId);
    const shareData = {
        title: jogo.title,
        text: `Confira: ${jogo.title}`,
        url: shareUrl
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
        } catch (err) {
            if (err.name !== 'AbortError') await copiarLink(shareUrl);
        }
    } else {
        await copiarLink(shareUrl);
    }
}

// Variáveis Globais de controle da galeria do Lightbox
let lightboxLista = [];
let lightboxIndexAtual = 0;
let touchStartX = 0;
let touchEndX = 0;

window.abrirLightbox = (index, lista) => {
    if (!lista || lista.length === 0) return;
    
    lightboxLista = lista;
    lightboxIndexAtual = index;
    
    atualizarLightbox();
    
    const lightboxEl = document.getElementById('lightbox');
    lightboxEl.classList.remove('hidden');

    // Registra navegação por teclado (Setas e ESC)
    window.addEventListener('keydown', lidarTecladoLightbox);
    
    // Configura os ouvintes de gestos touch para mobile
    lightboxEl.addEventListener('touchstart', lidarTouchStart, { passive: true });
    lightboxEl.addEventListener('touchend', lidarTouchEnd, { passive: true });
};

function atualizarLightbox() {
    const imgEl = document.getElementById('lightbox-img');
    const counterEl = document.getElementById('lightbox-counter');
    
    if (imgEl && lightboxLista[lightboxIndexAtual]) {
        imgEl.src = lightboxLista[lightboxIndexAtual];
    }
    
    if (counterEl) {
        counterEl.textContent = `${lightboxIndexAtual + 1} / ${lightboxLista.length}`;
    }
}

window.navegarLightbox = (e, direcao) => {
    if (e) e.stopPropagation(); // Evita fechar o lightbox ao clicar nas setas
    
    if (lightboxLista.length <= 1) return;
    
    const imgEl = document.getElementById('lightbox-img');
    
    if (imgEl) {
        // Define a classe de slide com base na direção (1 = próximo/esquerda, -1 = anterior/direita)
        const classeSlide = direcao > 0 ? 'slide-left' : 'slide-right';
        imgEl.classList.add(classeSlide);
        
        setTimeout(() => {
            lightboxIndexAtual = (lightboxIndexAtual + direcao + lightboxLista.length) % lightboxLista.length;
            atualizarLightbox();
            
            // Remove a classe de saída e aplica um leve efeito de entrada fluida oposta
            imgEl.classList.remove(classeSlide);
            const classeEntrada = direcao > 0 ? 'slide-right' : 'slide-left';
            imgEl.classList.add(classeEntrada);
            
            setTimeout(() => {
                imgEl.classList.remove(classeEntrada);
            }, 20);
        }, 150);
    } else {
        lightboxIndexAtual = (lightboxIndexAtual + direcao + lightboxLista.length) % lightboxLista.length;
        atualizarLightbox();
    }
};

window.fecharLightbox = (e, forcar = false) => {
    if (e) {
        // Interrompe o evento de clique/tecla imediatamente para não afetar o modal por trás
        e.stopPropagation();
    }

    // Se o clique for direto na imagem ou nos botões de controle e não for forçado, ignora
    if (!forcar && e && e.target && e.target.id !== 'lightbox') return;
    
    const lightboxEl = document.getElementById('lightbox');
    if (lightboxEl && !lightboxEl.classList.contains('hidden')) {
        lightboxEl.classList.add('hidden');
    }
    
    // Remove listeners acumulados
    window.removeEventListener('keydown', lidarTecladoLightbox);
    lightboxEl.removeEventListener('touchstart', lidarTouchStart);
    lightboxEl.removeEventListener('touchend', lidarTouchEnd);
};

// Navegação via teclado com controle isolado para o ESC
function lidarTecladoLightbox(e) {
    if (e.key === 'ArrowLeft') {
        navegarLightbox(e, -1);
    } else if (e.key === 'ArrowRight') {
        navegarLightbox(e, 1);
    } else if (e.key === 'Escape') {
        // Garante que o ESC vai ser consumido EXCLUSIVAMENTE pelo lightbox
        e.stopPropagation();
        e.preventDefault();
        fecharLightbox(e, true);
    }
}

// Gestos Touch (Swipe) para dispositivos móveis
function lidarTouchStart(e) {
    touchStartX = e.changedTouches[0].screenX;
}

function lidarTouchEnd(e) {
    touchEndX = e.changedTouches[0].screenX;
    lidarSwipe();
}

function lidarSwipe() {
    const limiteMinimoSwipe = 50;
    const diferenca = touchEndX - touchStartX;
    
    if (Math.abs(diferenca) > limiteMinimoSwipe) {
        if (diferenca < 0) {
            // Deslizou para a esquerda -> Próxima imagem
            navegarLightbox(null, 1);
        } else {
            // Deslizou para a direita -> Imagem anterior
            navegarLightbox(null, -1);
        }
    }
}

async function abrirModal(id, options = {}) {
    const jogo = jogosCarregados[id];
    if (!jogo) return;
    modalJogoAtual = id;
    atualizarBotaoWishlistModal(estaNaWishlist(jogo.feedlyId));

    const shareUrl = getShareUrl(jogo.feedlyId);
    const historyState = { modalOpen: true, gameId: jogo.feedlyId };
    const svgSize = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400 shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
    const svgReviews = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400 shrink-0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;    

    if (options.fromDeepLink) {
        history.replaceState(historyState, '', shareUrl);
    } else {
        history.pushState(historyState, '', shareUrl);
    }

    document.getElementById('modal-title-original').textContent = jogo.title;
    document.getElementById('modal-title-release').textContent = jogo.title;
    document.getElementById('modal-cover').src = jogo.cover;
    document.getElementById('modal-hero').style.backgroundImage = 'none';
    document.getElementById('modal-btn-share').onclick = compartilharJogoAtual;
    document.getElementById('modal-description').textContent = 'Buscando informações da Steam...';
    document.getElementById('game-size').innerHTML = `${svgSize}<span>${jogo.size}</span>`;
    document.getElementById('game-size-section').innerHTML = `${svgSize}<span>${jogo.size}</span>`;
    document.getElementById('total-reviews').innerHTML = `${svgReviews}<span>...</span>`;   
    document.getElementById('modal-developer').innerHTML = '';

    document.getElementById('steam-metadata').classList.add('hidden');
    document.getElementById('modal-section-screenshots').classList.add('hidden');
    document.getElementById('modal-section-recursos').classList.add('hidden');
    document.getElementById('modal-section-reviews').classList.add('hidden');
    document.getElementById('modal-section-videos').classList.add('hidden');
    document.getElementById('modal-section-hltb')?.classList.add('hidden');
    document.getElementById('modal-section-similares')?.classList.add('hidden');

    // Esconde os botões correspondentes que são assíncronos na barra da navegação
    ['hltb', 'recursos', 'screenshots', 'videos', 'reviews', 'similares', 'torbox'].forEach(sec => {
        atualizarVisibilidadeAtalho(sec, false);
    });

    const metaScoreEl = document.getElementById('modal-metacritic-score');
    metaScoreEl.className = 'absolute bottom-4 right-4 hidden h-16 w-16 flex items-center justify-center rounded-lg border-2 border-white/20 shadow-xl';
    document.getElementById('metacritic-score-value').textContent = '';
    document.getElementById('reviews-section-score')?.classList.add('hidden');
    document.getElementById('modal-links-grid').innerHTML = jogo.links.map(link => `
                <a href="${link.url}" target="_blank" class="bg-neutral-800 hover:bg-neutral-700 p-2 flex items-center gap-2 rounded text-xs font-bold text-neutral-300 border border-neutral-700">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                    ${link.label}
                </a>`).join('');
    document.getElementById('modal-downloads-grid').innerHTML = jogo.downloads.map(dl => `
                <a href="${dl.url}" target="_blank" class="bg-neutral-800 hover:bg-neutral-700 p-2 flex items-center gap-2 rounded text-xs font-bold text-neutral-300 border border-neutral-700">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    ${dl.label}
                </a>`).join('');

    document.getElementById('modal-overlay').classList.remove('hidden');
    // Garante que a barra flutuante do rodapé comece oculta ao abrir um jogo
    const floatingNav = document.getElementById('modal-floating-shortcuts');
    if (floatingNav) {
        floatingNav.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
        floatingNav.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
    }
    document.body.style.overflow = 'hidden';
    rolarParaSecaoModal('modal-content');

    if (jogo.steamId) {
        // --- INÍCIO: OTIMIZAÇÃO DE SSR (MODAL INSTANTÂNEO) ---
        // Se as informações já vieram mastigadas do Feedly Proxy / Vercel KV, renderiza na hora!
        if (jogo.steamDetails && jogo.steamDetails.name) {
            renderizarDadosSteamNoModal(jogo.steamDetails);
        } else {
            // Se não existir no cache (ex: jogo antigo não cacheado ainda), continua fazendo a requisição via proxy
            buscarDadosSteam(jogo.steamId);
        }
        // --- FIM: OTIMIZAÇÃO DE SSR ---

        buscarHowLongToBeat(jogo.steamId);
        buscarReviewsSteam(jogo.steamId);
        buscarJogosSimilares(jogo.steamId);
    } else {
        document.getElementById('modal-description').textContent = "Sem ID Steam detectado no post original.";
    }

    // Dispara a busca do Torbox independentemente de ter ID Steam ou não (pois depende apenas dos downloads)
    if (jogo.downloads && jogo.downloads.length > 0) {
        buscarDownloadsTorbox(jogo.downloads);
    }
}

function imagemExiste(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true)
        img.onerror = () => resolve(false);
        img.src = url;
    });
}

async function buscarDadosSteam(steamId) {
    await delay(1);
    try {
        const res = await fetch(PROXY_BASE_URL + steamId);
        const json = await res.json();
        const game = json[steamId]?.data;

        if (!game) throw new Error("Sem dados");

        // Nome e Banner
        document.getElementById('modal-title-original').textContent = game.name;
        if (game.header_image) document.getElementById('modal-hero').style.backgroundImage = `url('${game.header_image}')`;
        // Cover: Fallback para steam banner caso capa não exista
        (async () => {
            if (!await imagemExiste(document.getElementById('modal-cover').src)) {
                document.getElementById('modal-cover').src = `${game.header_image}`;
            }
        })();

        // Metadata e Metacritic
        const svgCalendar = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400 shrink-0"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
        document.getElementById('steam-metadata').classList.remove('hidden');
        document.getElementById('release-date').innerHTML = `${svgCalendar}<span>${formatarDataRelativa(game.release_date.date)}</span>`;
        document.getElementById('modal-genres').innerHTML = `<span class="text-neutral-500 text-[11px]">Gêneros:</span> ${game.genres.map(g => g.description).join(' <span class="text-neutral-600 text-xs">|</span> ')}`;
        document.getElementById('modal-developer').innerHTML = renderizarDesenvolvedores(game.developers);
        configurarExpandirDesenvolvedores(game.developers);

        document.getElementById('modal-description').innerHTML = game.detailed_description || game.short_description || "Sem descrição disponível.";

        // Screenshots (Todas)
        if (game.screenshots && game.screenshots.length > 0) {
            document.getElementById('modal-section-screenshots').classList.remove('hidden');
            atualizarVisibilidadeAtalho('screenshots', true);
            
            // Mapeia todas as URLs em alta resolução
            const listaUrls = game.screenshots.map(s => s.path_full);

            document.getElementById('modal-screenshots-grid').innerHTML = game.screenshots.map((s, idx) =>
                `<img src="${s.path_thumbnail}" referrerpolicy="no-referrer" onclick="abrirLightbox(${idx}, ${JSON.stringify(listaUrls).replace(/"/g, '&quot;')})" class="rounded border border-neutral-800 cursor-pointer hover:opacity-80 transition-opacity">`
            ).join('');
        }

        // Recursos (Categorias)
        if (game.categories && game.categories.length > 0) {
            document.getElementById('modal-section-recursos').classList.remove('hidden');
            atualizarVisibilidadeAtalho('recursos', true);
            document.getElementById('modal-recursos-grid').innerHTML = game.categories.map(c => {
                const iconName = CATEGORY_ICONS[c.id] || 'ico_achievements.png';
                const iconUrl = `https://store.fastly.steamstatic.com/public/images/v6/ico/${iconName}`;

                return `
                        <div class="bg-neutral-800 p-2 flex items-center gap-2 rounded text-xs font-bold text-neutral-300 border border-neutral-700">
                            <img src="${iconUrl}" class="w-6 h-4">
                            <span class="truncate">${c.description}</span>
                        </div>`;
            }).join('');
        }

        // Trailers (Todos)
        if (game.movies && game.movies.length > 0) {
            document.getElementById('modal-section-videos').classList.remove('hidden');
            atualizarVisibilidadeAtalho('videos', true);
            const container = document.getElementById('modal-youtube-container');
            container.innerHTML = ''; // Limpa container

            game.movies.forEach((m, idx) => {
                // Prioriza MP4, depois HLS (.m3u8), depois DASH (.mpd)
                const src = m.dash_av1 || m.dash_h264 || m.hls_h264;
                const type = src.includes('.m3u8') ? 'application/x-mpegURL' :
                    src.includes('.mpd') ? 'application/dash+xml' :
                        'video/mp4';

                const videoId = `vjs-player-${idx}`;
                container.innerHTML += `
                            <div class="mb-4">
                                <div class="aspect-video w-full !h-full">
                                    <video id="${videoId}" class="video-js vjs-default-skin w-full !h-full" controls preload="auto" poster="${m.thumbnail}">
                                    <source src="${src}" type="${type}">
                                </video>
                                </div>
                                ${m.name ? `<div class="bg-black text-neutral-400 text-xs font-bold uppercase tracking-widest px-3 py-2">${m.name}</div>` : ''}
                            </div>`;

                // Inicializa o player Video.js para este vídeo
                // Aguarda o próximo ciclo do DOM para inicializar
                setTimeout(() => {
                    if (window.videojs) {
                        videojs(videoId);
                    }
                }, 1);
            });
        }

    } catch (e) {
        console.error("Erro na busca Steam:", e);
        document.getElementById('modal-description').textContent = "Erro ao buscar dados na Steam.";
    }
}

function renderizarDadosSteamNoModal(game) {
    document.getElementById('modal-title-original').textContent = game.name;
    if (game.header_image) document.getElementById('modal-hero').style.backgroundImage = `url('${game.header_image}')`;
    
    const svgCalendar = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400 shrink-0"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    document.getElementById('steam-metadata').classList.remove('hidden');
    
    if (game.release_date?.date) {
        document.getElementById('release-date').innerHTML = `${svgCalendar}<span>${formatarDataRelativa(game.release_date.date)}</span>`;
    }
    
    if (game.genres && game.genres.length > 0) {
        document.getElementById('modal-genres').innerHTML = `<span class="text-neutral-500 text-[11px]">Gêneros:</span> ${game.genres.map(g => g.description || g).join(' <span class="text-neutral-600 text-xs">|</span> ')}`;
    }
    
    document.getElementById('modal-developer').innerHTML = renderizarDesenvolvedores(game.developers);
    configurarExpandirDesenvolvedores(game.developers);
    document.getElementById('modal-description').innerHTML = game.detailed_description || game.short_description || "Sem descrição disponível.";

    if (game.screenshots && game.screenshots.length > 0) {
        document.getElementById('modal-section-screenshots').classList.remove('hidden');
        atualizarVisibilidadeAtalho('screenshots', true);
        const listaUrls = game.screenshots.map(s => s.path_full || s);
        document.getElementById('modal-screenshots-grid').innerHTML = game.screenshots.map((s, idx) =>
            `<img src="${s.path_thumbnail || s}" referrerpolicy="no-referrer" onclick="abrirLightbox(${idx}, ${JSON.stringify(listaUrls).replace(/"/g, '&quot;')})" class="rounded border border-neutral-800 cursor-pointer hover:opacity-80 transition-opacity">`
        ).join('');
    }

    if (game.categories && game.categories.length > 0) {
        document.getElementById('modal-section-recursos').classList.remove('hidden');
        atualizarVisibilidadeAtalho('recursos', true);
        document.getElementById('modal-recursos-grid').innerHTML = game.categories.map(c => {
            const iconName = CATEGORY_ICONS[c.id] || 'ico_achievements.png';
            const iconUrl = `https://store.fastly.steamstatic.com/public/images/v6/ico/${iconName}`;
            return `
                    <div class="bg-neutral-800 p-2 flex items-center gap-2 rounded text-xs font-bold text-neutral-300 border border-neutral-700">
                        <img src="${iconUrl}" class="w-6 h-4">
                        <span class="truncate">${c.description}</span>
                    </div>`;
        }).join('');
    }

    // --- INÍCIO: RENDERIZAÇÃO DE VÍDEOS TAMBÉM PARA DADOS VINDO DO CACHE ---
    if (game.movies && game.movies.length > 0) {
        document.getElementById('modal-section-videos').classList.remove('hidden');
        atualizarVisibilidadeAtalho('videos', true);
        const container = document.getElementById('modal-youtube-container');
        container.innerHTML = ''; // Limpa container

        game.movies.forEach((m, idx) => {
            const src = m.dash_av1 || m.dash_h264 || m.hls_h264;
            if (!src) return;
            
            const type = src.includes('.m3u8') ? 'application/x-mpegURL' :
                src.includes('.mpd') ? 'application/dash+xml' :
                    'video/mp4';

            const videoId = `vjs-player-cache-${idx}`;
            container.innerHTML += `
                <div class="mb-4">
                    <div class="aspect-video w-full !h-full">
                        <video id="${videoId}" class="video-js vjs-default-skin w-full !h-full" controls preload="auto" poster="${m.thumbnail}">
                        <source src="${src}" type="${type}">
                    </video>
                    </div>
                    ${m.name ? `<div class="bg-black text-neutral-400 text-xs font-bold uppercase tracking-widest px-3 py-2">${m.name}</div>` : ''}
                </div>`;

            setTimeout(() => {
                if (window.videojs) {
                    videojs(videoId);
                }
            }, 1);
        });
    }
    // --- FIM: RENDERIZAÇÃO DE VÍDEOS ---
}

/**
 * Converte RGB para HSL
 */
function rgbParaHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Extrai a cor principal da imagem e identifica o tom de maior contraste
 */
function extrairCorDestaque(imgUrl, callback) {
    if (!imgUrl) {
        callback(null);
        return;
    }

    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imgUrl;

    img.onload = () => {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 60;
            canvas.height = 60;

            ctx.drawImage(img, 0, 0, 60, 60);
            const imageData = ctx.getImageData(0, 0, 60, 60).data;

            let melhorCor = null;
            let maiorSaturacao = -1;

            for (let i = 0; i < imageData.length; i += 4) {
                const r = imageData[i];
                const g = imageData[i + 1];
                const b = imageData[i + 2];
                const a = imageData[i + 3];

                if (a < 128) continue;

                const hsl = rgbParaHsl(r, g, b);

                // Filtra pretos puros, brancos puros e cinzas neutros
                if (hsl.l > 12 && hsl.l < 88 && hsl.s > 15) {
                    if (hsl.s > maiorSaturacao) {
                        maiorSaturacao = hsl.s;
                        melhorCor = hsl;
                    }
                }
            }

            callback(melhorCor);
        } catch (e) {
            callback(null);
        }
    };

    img.onerror = () => callback(null);
}

/**
 * Aplica a cor turbinada (HSL) com alto contraste e brilho neon nos elementos
 */
function aplicarCorDestaque(hslCor) {
    const tagsSpans = document.querySelectorAll('#featured-tags-container span');
    const iconesSvg = document.querySelectorAll('#featured-section .inline-flex svg');

    if (hslCor) {
        // --- BOOST DE VIVACIDADE PARA TEMA ESCURO ---
        const h = hslCor.h;
        const s = Math.max(hslCor.s, 85); // Força saturação mínima de 85%
        const l = 60;                    // Ajusta a luminosidade ideal para contrastar no escuro (60%)

        const corVibrante = `hsl(${h}, ${s}%, ${l}%)`;
        const bgCor = `hsla(${h}, ${s}%, ${l}%, 0.16)`;
        const borderCor = `hsla(${h}, ${s}%, ${l}%, 0.45)`;
        const glowEfect = `drop-shadow(0 0 6px hsla(${h}, ${s}%, ${l}%, 0.65))`;

        // 1. Aplica na(s) Tag(s) da release
        tagsSpans.forEach(span => {
            span.style.color = corVibrante;
            span.style.backgroundColor = bgCor;
            span.style.borderColor = borderCor;
        });

        // 2. Aplica nos ícones dos campos informativos com brilho (glow)
        iconesSvg.forEach(svg => {
            svg.style.color = corVibrante;
        });
    } else {
        // Fallback limpo caso falhe a leitura da imagem
        tagsSpans.forEach(span => {
            span.removeAttribute('style');
        });
        iconesSvg.forEach(svg => {
            svg.removeAttribute('style');
        });
    }
}

let destaqueAtualObj = null;

function renderizarDestaque(destaques) {
    const sec = document.getElementById('featured-section');
    const globalBg = document.getElementById('global-featured-bg');
    if (!sec) return;

    // Regra de prioridade para releases especiais (apenas se ocorreu no dia de hoje)
    const hojeStr = new Date().toDateString();
    const jogoVoices38 = jogosCarregados.find(j => {
        const ehVoices = /voices38/i.test(j.title);
        const foiLancadoHoje = j.published && new Date(j.published).toDateString() === hojeStr;
        return ehVoices && foiLancadoHoje;
    });
    let top1 = null;

    if (jogoVoices38) {
        top1 = {
            name: jogoVoices38.release?.tituloOriginal || jogoVoices38.title,
            steamId: jogoVoices38.steamId,
            header_image: jogoVoices38.steamDetails?.header_image || (jogoVoices38.steamId ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${jogoVoices38.steamId}/header.jpg` : ''),
            background_raw: jogoVoices38.steamDetails?.background_raw || jogoVoices38.steamDetails?.background || '',
            rating: jogoVoices38.steamDetails?.rating || 0,
            total_reviews: jogoVoices38.steamDetails?.total_reviews || 0,
            release_date: jogoVoices38.steamDetails?.release_date || null
        };
        if (jogoVoices38.steamDetails?.name) {
            top1.name = jogoVoices38.steamDetails.name;
        }
    } else if (destaques && destaques.length > 0) {
        const agora = Date.now();
        const limite24h = 24 * 60 * 60 * 1000;
        
        // 1. Filtra para garantir que o destaque tenha sido publicado nas últimas 24 horas (ajuste anterior)
        const destaquesValidos = destaques.filter(d => {
            const jogoFeed = jogosCarregados.find(j => j.steamId == d.steamId);
            const pubTime = d.published || jogoFeed?.published || 0;
            return (agora - pubTime) <= limite24h;
        });

        if (destaquesValidos.length > 0) {
            // 2. Sistema anti-repetição para o F5: lê o último jogo exibido
            const ultimoId = localStorage.getItem('rt_ultimo_destaque');
            let candidatos = destaquesValidos;

            // Se houver mais de 1 jogo na lista, remove o último exibido para GARANTIR que mude no F5
            if (destaquesValidos.length > 1 && ultimoId) {
                candidatos = destaquesValidos.filter(d => String(d.steamId) !== String(ultimoId));
            }

            // 3. Sorteia aleatoriamente um jogo entre os candidatos restantes
            const indexAleatorio = Math.floor(Math.random() * candidatos.length);
            top1 = candidatos[indexAleatorio];

            // 4. Salva o ID escolhido para que ele não se repita na próxima vez que atualizar a página
            if (top1?.steamId) {
                localStorage.setItem('rt_ultimo_destaque', String(top1.steamId));
            }
        }
    }

    if (!top1) {
        sec.classList.add('hidden');
        if (globalBg) globalBg.classList.add('hidden');
        return;
    }

    destaqueAtualObj = top1;
    const jogoNoFeed = jogosCarregados.find(j => j.steamId == top1.steamId || (top1.name && j.title.toLowerCase().includes(top1.name.toLowerCase())));

    const titleEl = document.getElementById('featured-title');
    if (titleEl) titleEl.textContent = top1.name || 'Destaque';

    // Atribuição das imagens no renderizarDestaque
    const headerImageUrl = top1.header_image || (top1.steamId ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${top1.steamId}/header.jpg` : '');

    // 1. Imagem Principal
    document.getElementById('featured-img').src = headerImageUrl;

    // 2. Imagem do Fundo do Rodapé (Atribuição direta de SRC)
    const infoBgImg = document.getElementById('featured-info-bg-img');
    if (infoBgImg) {
        infoBgImg.src = headerImageUrl;
    }

    // Configuração do Fundo Global
    let bgRawUrl = top1.background_raw || '';
     if (!bgRawUrl || bgRawUrl.includes('skidrowreloaded') || bgRawUrl.includes('cover-proxy') || bgRawUrl.includes('header.jpg')) {
        if (top1.steamId) {
            bgRawUrl = `https://store.akamai.steamstatic.com/images/storepagebackground/app/${top1.steamId}`;
        } else {
            bgRawUrl = '';
        }
    }
    bgRawUrl = headerImageUrl; //Sobrescrevendo imagem header no lugar da background da steam

    if (globalBg && bgRawUrl && !bgRawUrl.includes('skidrowreloaded') && !bgRawUrl.includes('cover-proxy')) {
        globalBg.style.backgroundImage = `url('${bgRawUrl}')`;
        globalBg.classList.remove('hidden');
    } else if (globalBg) {
        globalBg.classList.add('hidden');
    }

    // 1. Renderiza as Tags do jogo
    const tagsContainer = document.getElementById('featured-tags-container');
    if (tagsContainer) {
        if (jogoNoFeed && jogoNoFeed.release?.tags?.length > 0) {
            tagsContainer.innerHTML = jogoNoFeed.release.tags.map(tag => `
                <span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-rajdhani font-bold text-xs sm:text-sm px-2.5 py-1 rounded-md shadow-sm uppercase">
                    ${tag}
                </span>
            `).join('');
            tagsContainer.classList.remove('hidden');
            tagsContainer.classList.add('inline-flex');
        } else {
            tagsContainer.innerHTML = '';
            tagsContainer.classList.add('hidden');
            tagsContainer.classList.remove('inline-flex');
        }
    }

    // 2. Tamanho
    document.getElementById('featured-size').textContent = jogoNoFeed ? jogoNoFeed.size : 'N/A';

    // 3. Nota Steam Ampliada (Estilo idêntico ao Hero do Modal)
    const nota = top1.rating || 0;
    const ratingEl = document.getElementById('featured-rating');
    const ratingBadge = document.getElementById('featured-rating-badge');

    if (ratingEl && ratingBadge) {
        if (nota > 0) {
            const cores = getMetacriticColor(nota);
            ratingEl.textContent = nota;
            
            // Aplica o mesmo estilo de container quadrado com borda 2px, sombra e gradiente/cor do modal
            ratingBadge.className = `absolute top-3 right-3 sm:top-4 sm:right-4 z-20 flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-lg border-2 ${cores.border} ${cores.bg} shadow-xl [text-shadow:0_1px_3px_rgba(0,0,0,0.8)] cursor-pointer`;
            
            ratingBadge.classList.remove('hidden');
        } else {
            ratingBadge.classList.add('hidden');
        }
    }

    // 4. Avaliações
    const revs = top1.total_reviews || 0;
    document.getElementById('featured-reviews').textContent = revs > 0 ? revs.toLocaleString('pt-BR') : 'N/A';
    
    // 5. Data de Lançamento
    const dataLanc = top1.release_date?.date || 'N/A';
    document.getElementById('featured-release-date').textContent = formatarDataRelativa(dataLanc);

    // --- EXTRAÇÃO DINÂMICA DE COR DA IMAGEM DO HEADER ---
    extrairCorDestaque(headerImageUrl, (corRgb) => {
        aplicarCorDestaque(corRgb);
    });

    atualizarVisibilidadeDestaque();
}

function abrirModalDestaque() {
    if (!destaqueAtualObj) return;
    const index = jogosCarregados.findIndex(j => j.steamId == destaqueAtualObj.steamId);
    if (index >= 0) {
        abrirModal(index);
    } else {
        alert("O release deste destaque não está entre os últimos itens listados na página atual.");
    }
}

function formatarBbcodeSteam(texto) {
    if (!texto) return '';

    return texto
        // 1. Quebras de linha
        .replace(/\n/g, '<br>')

        // 2. Títulos
        .replace(/\[h1\](.*?)\[\/h1\]/gi, '<h1 class="text-sm font-bold text-white mt-2 mb-1 border-b border-neutral-700/50 pb-0.5">$1</h1>')
        .replace(/\[h2\](.*?)\[\/h2\]/gi, '<h2 class="text-xs font-bold text-white mt-1.5 mb-1">$1</h2>')
        .replace(/\[h3\](.*?)\[\/h3\]/gi, '<h3 class="text-xs font-semibold text-neutral-200 mt-1 mb-0.5">$1</h3>')

        // 3. Estilos de Texto
        .replace(/\[b\](.*?)\[\/b\]/gi, '<b class="font-bold text-neutral-200">$1</b>')
        .replace(/\[i\](.*?)\[\/i\]/gi, '<i class="italic">$1</i>')
        .replace(/\[u\](.*?)\[\/u\]/gi, '<u class="underline decoration-neutral-500">$1</u>')
        .replace(/\[strike\](.*?)\[\/strike\]/gi, '<s class="line-through text-neutral-500">$1</s>')

        // 4. Spoilers (Efeito interativo: borrado que revela ao passar o mouse)
        .replace(/\[spoiler\](.*?)\[\/spoiler\]/gi, '<span class="bg-neutral-800 text-transparent hover:text-neutral-200 select-none hover:select-text rounded px-1 transition-colors cursor-pointer" title="Spoiler">$1</span>')

        // 5. Citações e Código
        .replace(/\[quote\](.*?)\[\/quote\]/gi, '<blockquote class="border-l-2 border-neutral-600 pl-2 my-1 italic text-neutral-400 bg-neutral-900/40 py-0.5">$1</blockquote>')
        .replace(/\[code\](.*?)\[\/code\]/gi, '<code class="bg-neutral-900 border border-neutral-800 text-emerald-400 font-mono text-[11px] px-1 py-0.5 rounded">$1</code>')

        // 6. Listas e Links
        .replace(/\[list\](.*?)\[\/list\]/gi, '<ul class="list-disc list-inside my-1 space-y-0.5">$1</ul>')
        .replace(/\[\*\]/gi, '• ')
        .replace(/\[url=(.*?)\](.*?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-emerald-400 hover:underline">$2</a>');
}

async function buscarReviewsSteam(steamId) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/steam-proxy?action=reviews&appid=${steamId}`);
        const json = await res.json();

        if (json.success && json.reviews && json.reviews.length > 0) {
            const section = document.getElementById('modal-section-reviews');
            const list = document.getElementById('modal-reviews-list');

            //Nota cabeçalho e seção de avaliações
            let notaSteam = Math.trunc((json.query_summary.total_positive * 100) / json.query_summary.total_reviews);
            const { bg, border } = getMetacriticColor(notaSteam);

            // 1. Atualiza a nota do Hero/Cabeçalho
            const metaScoreEl = document.getElementById('modal-metacritic-score');
            metaScoreEl.className = `absolute top-2 right-2 h-16 w-16 flex flex-col items-center justify-center rounded-lg border-2 ${border} ${bg} shadow-xl [text-shadow:0_1px_3px_rgba(0,0,0,0.8)] hover:cursor-pointer`;
            document.getElementById('metacritic-score-value').textContent = notaSteam;

            // 2. Atualiza a nota na Seção de Avaliações (Sombra, fonte maior e alinhado à direita)
            const reviewsSectionScoreEl = document.getElementById('reviews-section-score');
            if (reviewsSectionScoreEl) {
                reviewsSectionScoreEl.textContent = `${notaSteam}`;
                reviewsSectionScoreEl.className = `inline-flex items-center justify-center ${bg} border ${border} px-1.5 py-0.5 rounded text-base font-black text-white shadow-md leading-none ml-auto [text-shadow:0_1px_3px_rgba(0,0,0,0.8)] tracking-tight`;
            }

            //Total avaliações
            const svgReviews = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400 shrink-0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
            const totalReviews = json?.query_summary?.total_reviews?.toLocaleString('pt-BR') || 0;
            document.getElementById('total-reviews').innerHTML = `${svgReviews}<span>${totalReviews}</span>`;

            section.classList.remove('hidden');
            atualizarVisibilidadeAtalho('reviews', true);
            // Filtra para manter apenas PT-BR e Inglês
            const filteredReviews = json.reviews.filter(review =>
                review.language === 'brazilian' || review.language === 'english'
            );
            list.innerHTML = filteredReviews.map(r => {
                const iconHtml = r.voted_up
                    ? `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="inline mr-2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`
                    : `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="inline mr-2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm10-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/></svg>`;

                const dataFormatada = formatarTimestamp(r.timestamp_updated || r.timestamp_created);
                const pHoras = r.author.playtime_forever ? Math.round(r.author.playtime_forever / 60) + 'h' : '0h';

                return `
                    <!-- Card de Avaliação com clique para expandir/ocultar -->
                    <div onclick="const textEl = this.querySelector('.review-text'); const btnEl = this.querySelector('.review-toggle-btn'); if (textEl && btnEl) { textEl.classList.toggle('line-clamp-4'); btnEl.textContent = textEl.classList.contains('line-clamp-4') ? 'MAIS' : 'MENOS'; }" 
                         class="bg-neutral-800/30 border border-neutral-800 p-4 pb-2 rounded-md cursor-pointer hover:border-neutral-700/80 transition-colors">
                        
                        <!-- Topo do Card -->
                        <div class="flex items-center justify-between gap-2 mb-2 flex-wrap">
                            <!-- Esquerda: Recomendado / Não Recomendado -->
                            <span class="${r.voted_up ? 'text-emerald-500' : 'text-red-500'} font-bold text-[10px] tracking-wider uppercase flex items-center shrink-0">
                                ${iconHtml} ${r.voted_up ? ' RECOMENDADO' : ' NÃO RECOMENDADO'}
                            </span>

                            <!-- Direita: Horas jogadas + Ponto divisor + Data de avaliação -->
                            <div class="flex items-center gap-1.5 text-neutral-500 text-[10px] ml-auto shrink-0">
                                <span class="flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-neutral-400 inline shrink-0"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><path d="M17.32 5H6.68a4 4 0 0 0-3.97 3.55l-.6 6.06A4 4 0 0 0 6 19h12a4 4 0 0 0 3.89-4.39l-.6-6.06A4 4 0 0 0 17.32 5z"/></svg>
                                    ${pHoras}
                                </span>
                                
                                <span>•</span>

                                <span class="flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-neutral-400 inline shrink-0"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                    ${dataFormatada}
                                </span>
                            </div>
                        </div>

                        <!-- Texto da Avaliação -->
                        <div>
                            <div class="review-text text-[12px] text-neutral-400 line-clamp-4 break-words">${formatarBbcodeSteam(r.review)}</div>
                            
                            <div class="flex items-center justify-between mt-3.5 min-h-[20px]">
                                <!-- Upvotes alinhado à esquerda estilo Reddit -->
                                <div>
                                    ${r.votes_up > 0 ? `
                                    <span class="text-neutral-500 text-[10px] flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500/80 inline"><path d="m18 15-6-6-6 6"/></svg>
                                        ${r.votes_up}
                                    </span>` : ''}
                                </div>

                                <!-- Botão MAIS / MENOS -->
                                ${r.review.length > 250 || r.review.split('\n').length > 4 ? `
                                <button type="button" 
                                        onclick="event.stopPropagation(); const textEl = this.parentElement.previousElementSibling; textEl.classList.toggle('line-clamp-4'); this.textContent = textEl.classList.contains('line-clamp-4') ? 'MAIS' : 'MENOS';" 
                                        class="review-toggle-btn text-[8px] uppercase text-neutral-500 font-bold hover:text-emerald-400 transition-colors tracking-tight">MAIS</button>
                                ` : ''}
                            </div>
                        </div>

                    </div>
                `;
            }).join('');
        }
    } catch (e) { console.error("Erro ao buscar reviews", e); }
}

async function buscarHowLongToBeat(steamId) {
    const section = document.getElementById('modal-section-hltb');
    const container = document.getElementById('modal-hltb-grid');
    if (!section || !container) return;

    try {
        // Tenta buscar da API do Codepotatoes
        const res = await fetch(`${API_BASE_URL}/api/hltb-proxy?appid=${steamId}`);
        if (!res.ok) throw new Error("HLTB não encontrado");
        const data = await res.json();

        // Converte para números e garante fallback zero se vier vazio/null
        const main = Number(data.mainStory) || 0;
        const extras = Number(data.mainStoryWithExtras) || 0;
        const comp = Number(data.completionist) || 0;

        // Se o jogo não tiver nenhum tempo registrado, não exibe a seção
        if (main === 0 && extras === 0 && comp === 0) {
            return;
        }

        // Pega o maior tempo para ser a referência dos 100% de largura da barra
        const maxTime = Math.max(main, extras, comp, 1);

        // Helper para formatar decimal em horas e minutos (Ex: 25.5 => "25h 30m")
        const formatarHoras = (h) => {
            if (!h || h === 0) return 'N/A';
            const horas = Math.floor(h);
            const minutos = Math.round((h - horas) * 60);
            if (minutos === 0) return `${horas}h`;
            return `${horas}h ${minutos}m`;
        };

        // Configuração visual de cada barra com cores distintas do Tailwind
        const barras = [
            { label: 'História Principal', tempo: main, cor: 'from-emerald-600 to-emerald-400', bgDot: 'bg-emerald-500', textCor: 'text-emerald-400' },
            { label: 'História + Extras', tempo: extras, cor: 'from-sky-600 to-sky-400', bgDot: 'bg-sky-500', textCor: 'text-sky-400' },
            { label: 'Completista (100%)', tempo: comp, cor: 'from-purple-600 to-purple-400', bgDot: 'bg-purple-500', textCor: 'text-purple-400' }
        ].filter(item => item.tempo > 0); // Filtra para mostrar apenas o que tem dados

        // Renderiza as barras horizontais
        container.innerHTML = barras.map(b => {
            // Calcula a porcentagem da barra (com mínimo de 8% para a animação ficar bonita mesmo em números baixos)
            const porcentagem = Math.max((b.tempo / maxTime) * 100, 8); 
            
            return `
                <div class="space-y-1.5">
                    <div class="flex justify-between items-center text-xs font-bold">
                        <span class="text-neutral-300 flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full ${b.bgDot} inline-block shadow-sm"></span>
                            ${b.label}
                        </span>
                        <span class="${b.textCor} font-mono text-xs sm:text-sm bg-neutral-900 px-2.5 py-0.5 rounded border border-neutral-800">${formatarHoras(b.tempo)}</span>
                    </div>
                    <div class="w-full bg-neutral-900/90 h-2.5 rounded-full overflow-hidden border border-neutral-800 p-0.5">
                        <div class="bg-gradient-to-r ${b.cor} h-full rounded-full transition-all duration-1000 ease-out shadow-sm" style="width: ${porcentagem}%"></div>
                    </div>
                </div>
            `;
        }).join('');

        // Revela a seção no modal
        section.classList.remove('hidden');
        atualizarVisibilidadeAtalho('hltb', true);
    } catch (e) {
        console.log("Sem dados no How Long to Beat para este jogo:", steamId);
    }
}

async function buscarJogosSimilares(steamId) {
    const section = document.getElementById('modal-section-similares');
    const container = document.getElementById('modal-similares-grid');
    if (!section || !container) return;

    try {
        const res = await fetch(`${API_BASE_URL}/api/steam-proxy?action=similar&appid=${steamId}`);
        if (!res.ok) throw new Error("Erro ao buscar similares");
        
        const data = await res.json();
        
        // Se não encontrar jogos similares, mantém a seção oculta
        if (!data.success || !data.items || data.items.length === 0) {
            return;
        }

        container.innerHTML = data.items.map(jogo => `
            <a href="https://store.steampowered.com/app/${jogo.id}" target="_blank" title="Ver na Steam: ${jogo.name}" class="group bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden hover:border-emerald-500/50 transition-all flex flex-col justify-between shadow-md">
                <div class="aspect-[460/215] w-full bg-neutral-900 overflow-hidden relative">
                    <img src="${jogo.cover}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='https://store.fastly.steamstatic.com/public/images/v6/app_default_header.jpg';" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                </div>
                <div class="p-2.5 flex items-center justify-between gap-2">
                    <span class="font-bold text-xs text-neutral-300 group-hover:text-white truncate block">${jogo.name}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-neutral-500 group-hover:text-emerald-400 shrink-0 transition-colors"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </div>
            </a>
        `).join('');

        section.classList.remove('hidden');
        atualizarVisibilidadeAtalho('similares', true);
    } catch (e) {
        console.log("Falha ao carregar jogos similares para:", steamId);
    }
}

function fecharModal(fromPopstate = false) {
    if (window.videojs) {
        const players = videojs.getAllPlayers();
        players.forEach(player => player.dispose());
    }

    if (!fromPopstate && history.state?.modalOpen) {
        history.back();
    }

    // Oculta a barra flutuante ao fechar
    const floatingNav = document.getElementById('modal-floating-shortcuts');
    if (floatingNav) {
        floatingNav.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
        floatingNav.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
    }

    modalJogoAtual = null;
    document.body.style.overflow = '';
    document.getElementById('modal-overlay').classList.add('hidden');
}

function fecharModalFora(e) { if (e.target.id === 'modal-overlay') fecharModal(); }

function atualizarVisibilidadeAtalho(secao, visivel) {
    const elOriginal = document.getElementById(`shortcut-${secao}`);
    const elFloating = document.getElementById(`float-shortcut-${secao}`);

    if (visivel) {
        elOriginal?.classList.remove('hidden');
        elFloating?.classList.remove('hidden');
    } else {
        elOriginal?.classList.add('hidden');
        elFloating?.classList.add('hidden');
    }
}

// --- Lógica de Busca ---

async function executarBusca(termo) {
    termoPesquisado = termo;
    
    // Oculta o destaque imediatamente ao iniciar a busca (sem esperar a API)
    atualizarVisibilidadeDestaque();

    // Esconde a tag de filtro da Wishlist se estiver aberta
    document.getElementById('wishlist-filter-tag')?.classList.add('hidden');
    
    // Mostra o container de filtros de busca
    const filterTag = document.getElementById('search-filter-tag');
    if (filterTag) filterTag.classList.remove('hidden');
    
    // Atualiza o texto do termo pesquisado
    const termText = document.getElementById('search-term-text');
    if (termText) termText.textContent = `${termo}`;

    // Atualiza o estilo visual dos botões de filtro
    atualizarEstiloBotoesFiltro();

    const grid = document.getElementById('grid');
    grid.innerHTML = '<div class="col-span-full text-center py-20 text-emerald-500 animate-pulse">Buscando...</div>';

    if (fonteAtual === 'feedly') {
        // Busca remota no Skidrow via Scraping
        try {
            const res = await fetch(`${API_BASE_URL}/api/skidrow-search?query=${encodeURIComponent(termo)}`);
            const data = await res.json();
            
            jogosCarregados = [];
            const items = data.items || [];
            
            items.forEach((item, index) => {
                const jogo = parseFeedlyItem(item, index);
                jogosCarregados.push(jogo);
            });
            
            if (jogosCarregados.length === 0) {
                grid.innerHTML = '<div class="col-span-full text-neutral-500 text-center py-20">Nenhum resultado encontrado no Skidrow.</div>';
            } else {
                renderizarJogos();
            }
        } catch (err) {
            console.error("Erro busca Skidrow:", err);
            grid.innerHTML = '<div class="col-span-full text-red-500 text-center py-20">Erro ao buscar no Skidrow.</div>';
        }
    } else {
        // Busca na API da Steam
        try {
            const res = await fetch(`${API_BASE_URL}/api/steam-proxy?action=search&term=${encodeURIComponent(termo)}`);
            const data = await res.json();
            
            jogosCarregados = (data.items || []).map((item, index) => {
                const steamId = item.id;
                
                // 1ª opção: Capa Vertical HD
                const cover = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamId}/library_600x900.jpg`;
                
                // 2ª opção (Fallback 1): Capa Vertical Padrão
                const rawCover = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamId}/library_capsule.jpg`;
                
                // 3ª opção (Fallback 2): Header Horizontal HD ou a tiny_image original do retorno da API
                const fallbackImage = item.tiny_image || `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamId}/header.jpg`;
                const postLink = `https://store.steampowered.com/app/${steamId}`;
                const links = [
                    { label: 'Atualizações', url: `https://store.steampowered.com/newshub/?appids=${steamId}` },
                    { label: 'Discussões', url: `https://steamcommunity.com/app/${steamId}/discussions/` },
                    { label: 'Steam', url: postLink },
                ];

                return {
                    id: index,
                    feedlyId: `steam-${steamId}`,
                    title: item.name,
                    cover: cover,
                    rawCover: rawCover,
                    fallbackImage: fallbackImage,
                    postLink: postLink,
                    downloads: [],
                    date: 'Steam',
                    steamId: steamId.toString(),
                    links,
                    size: '...',
                    release: {
                        tituloOriginal: item.name,
                        versao: '',
                        tags: []
                    }
                };
            });

            if (jogosCarregados.length === 0) {
                grid.innerHTML = '<div class="col-span-full text-neutral-500 text-center py-20">Nenhum resultado encontrado na Steam.</div>';
            } else {
                renderizarJogos();
            }
        } catch (err) {
            console.error("Erro busca Steam:", err);
            grid.innerHTML = '<div class="col-span-full text-red-500 text-center py-20">Erro ao buscar na Steam.</div>';
        }
    }
}

function atualizarEstiloBotoesFiltro() {
    const btnFeedly = document.getElementById('btn-filter-feedly');
    const btnSteam = document.getElementById('btn-filter-steam');
    if (!btnFeedly || !btnSteam) return;

    if (fonteAtual === 'feedly') {
        btnFeedly.className = "px-2.5 py-0.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-bold transition-all";
        btnSteam.className = "px-2.5 py-0.5 rounded-md border border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white transition-all";
    } else {
        btnSteam.className = "px-2.5 py-0.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-bold transition-all";
        btnFeedly.className = "px-2.5 py-0.5 rounded-md border border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white transition-all";
    }
}

function limparBusca() {
    termoPesquisado = '';
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    const filterTag = document.getElementById('search-filter-tag');
    if (filterTag) filterTag.classList.add('hidden');

    // --- INÍCIO: ALTERAR COMPORTAMENTO LIMPAR BUSCA PARA WISHLIST ---
    if (fonteAtual === 'wishlist') {
        jogosCarregados = [...wishlistJogos];
    } else {
        jogosCarregados = [...jogosOriginaisFeedly];
    }
    // --- FIM: ALTERAR COMPORTAMENTO LIMPAR BUSCA PARA WISHLIST ---
    
    renderizarJogos();
}

// --- LÓGICA DA BARRA DE ATALHOS NO MODAL ---

// Função que rola suavemente para o destino escolhido compensando a altura da barra minimalista
function rolarParaSecaoModal(elementId) {
    const alvo = document.getElementById(elementId);
    if (!alvo) return;
    
    const compensacao = 20; // Leve margem no topo, já que a barra agora flutua no bottom
    const modalContainer = document.getElementById('modal-overlay');
    
    if (elementId === 'modal-content') {
        modalContainer.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        const elementoTop = alvo.getBoundingClientRect().top;
        const atualTop = modalContainer.scrollTop;
        
        modalContainer.scrollTo({
            top: atualTop + elementoTop - compensacao,
            behavior: 'smooth'
        });
    }
}

// Configuração de Event Listeners de Busca
let debounceTimer;
document.getElementById('search-input')?.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    const query = e.target.value.trim();
    debounceTimer = setTimeout(() => {
        if (query) {
            executarBusca(query);
        } else {
            limparBusca();
        }
    }, 400);
});

document.getElementById('search-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();
        if (query) {
            executarBusca(query);
        } else {
            limparBusca();
        }
    }
});

document.getElementById('btn-filter-feedly')?.addEventListener('click', () => {
    if (fonteAtual !== 'feedly') {
        fonteAtual = 'feedly';
        if (termoPesquisado) executarBusca(termoPesquisado);
    }
});

document.getElementById('btn-filter-steam')?.addEventListener('click', () => {
    if (fonteAtual !== 'steam') {
        fonteAtual = 'steam';
        if (termoPesquisado) executarBusca(termoPesquisado);
    }
});

document.getElementById('btn-clear-search')?.addEventListener('click', limparBusca);

// Atualiza o contador imediatamente com o que veio do cache local
atualizarContadorWishlist();

// Inicialização principal
carregarJogos();

// Ajuste na escuta do botão Voltar do navegador (popstate)
window.addEventListener('popstate', () => {
    // 1. Se o lightbox estiver aberto, fecha SOMENTE ele primeiro
    const lightbox = document.getElementById('lightbox');
    if (lightbox && !lightbox.classList.contains('hidden')) {
        fecharLightbox(null, true);
        return;
    }

    // 2. Caso contrário, fecha o modal normalmente
    const modal = document.getElementById('modal-overlay');
    if (modal && !modal.classList.contains('hidden')) {
        fecharModal(true);
    }
});

// PWA: Registrar Service Worker para aceitar instalação do app no navegador mobile
if ('serviceWorker' in navigator && window.location.protocol !== 'file:' && window.location.origin !== 'null') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('Service Worker registrado!'))
        .catch(err => console.log('Erro ao registrar Service Worker:', err));
    });
}

// --- INÍCIO: NOVAS FUNÇÕES EXCLUSIVAS PARA CONTROLE DA WISHLIST ---
async function carregarWishlistDoServidor() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/wishlist?token=${encodeURIComponent(userToken)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.wishlist && Array.isArray(data.wishlist)) {
            wishlistJogos = data.wishlist;
            
            // Atualiza o backup local para garantir que o próximo F5 já venha atualizado
            localStorage.setItem('rt_wishlist_backup', JSON.stringify(wishlistJogos));
            
            atualizarContadorWishlist();
            if (fonteAtual === 'wishlist') renderizarJogos();
        }
    } catch (err) {
        console.error("Erro ao carregar Wishlist remota:", err);
    }
}

async function salvarWishlistNoServidor() {
    localStorage.setItem('rt_wishlist_backup', JSON.stringify(wishlistJogos));
    atualizarContadorWishlist();
    try {
        await fetch(`${API_BASE_URL}/api/wishlist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: userToken, wishlist: wishlistJogos })
        });
    } catch (err) {
        console.error("Erro ao sincronizar Wishlist com servidor:", err);
    }
}

function atualizarContadorWishlist() {
    const countEl = document.getElementById('wishlist-count');
    const tagCountEl = document.getElementById('wishlist-tag-count');
    if (countEl) countEl.textContent = wishlistJogos.length;
    if (tagCountEl) tagCountEl.textContent = wishlistJogos.length;
}

function estaNaWishlist(feedlyId) {
    return wishlistJogos.some(j => j.feedlyId === feedlyId);
}

function alternarWishlist(jogo) {
    if (!jogo) return;
    const index = wishlistJogos.findIndex(j => j.feedlyId === jogo.feedlyId);
    if (index >= 0) {
        wishlistJogos.splice(index, 1);
    } else {
        wishlistJogos.unshift(jogo);
    }
    salvarWishlistNoServidor();
    
    if (fonteAtual === 'wishlist') {
        jogosCarregados = [...wishlistJogos];
        renderizarJogos();
    }
    return index < 0;
}

function alternarWishlistJogoAtual() {
    if (modalJogoAtual === null || !jogosCarregados[modalJogoAtual]) return;
    const jogo = jogosCarregados[modalJogoAtual];
    const adicionado = alternarWishlist(jogo);
    atualizarBotaoWishlistModal(adicionado);
}

function atualizarBotaoWishlistModal(ativo) {
    const btn = document.getElementById('modal-btn-wishlist');
    const icon = document.getElementById('wishlist-btn-icon');
    const text = document.getElementById('wishlist-btn-text');
    if (!btn || !icon || !text) return;

    if (ativo) {
        btn.className = "inline-flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold text-xs px-2 py-1.5 rounded-md transition-all";
        icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500 group-hover:scale-110 transition-transform">
  <path d="M 12 3 H 5 a 2 2 0 0 0 -2 2 v 14 a 2 2 0 0 0 2 2 h 14 a 2 2 0 0 0 2 -2 v -5"/>
  <path d="m6 13 4.5 4.5 11-12"/>
</svg>
`;
        icon.className = "font-mono font-bold text-red-400";
        text.textContent = "Na Wishlist";
    } else {
        btn.className = "inline-flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 font-bold text-xs px-2 py-1.5 rounded-md transition-all";
        icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500 group-hover:scale-110 transition-transform"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
        icon.className = "font-mono font-bold text-emerald-400";
        text.textContent = "Wishlist";
    }
}

function removerDaWishlist(feedlyId, event) {
    if (event) event.stopPropagation();
    const index = wishlistJogos.findIndex(j => j.feedlyId === feedlyId);
    if (index >= 0) {
        wishlistJogos.splice(index, 1);
        salvarWishlistNoServidor();
        if (fonteAtual === 'wishlist') {
            jogosCarregados = [...wishlistJogos];
            renderizarJogos();
        }
    }
}

function alternarModoWishlist() {
    if (fonteAtual === 'wishlist') {
        fecharModoWishlist();
    } else {
        abrirModoWishlist();
    }
}

function abrirModoWishlist() {
    fonteAtual = 'wishlist';
    document.getElementById('search-filter-tag')?.classList.add('hidden');
    document.getElementById('wishlist-filter-tag')?.classList.remove('hidden');
    const btnWishlist = document.getElementById('btn-header-wishlist');
    if (btnWishlist) btnWishlist.classList.add('border-emerald-500/50', 'bg-emerald-950/30');
    
    jogosCarregados = [...wishlistJogos];
    renderizarJogos();
}

function fecharModoWishlist() {
    fonteAtual = 'feedly';
    document.getElementById('wishlist-filter-tag')?.classList.add('hidden');
    const btnWishlist = document.getElementById('btn-header-wishlist');
    if (btnWishlist) btnWishlist.classList.remove('border-emerald-500/50', 'bg-emerald-950/30');
    
    if (termoPesquisado) {
        executarBusca(termoPesquisado);
    } else {
        jogosCarregados = [...jogosOriginaisFeedly];
        renderizarJogos();
    }
}

function abrirModalSync() {
    document.getElementById('user-token-display').textContent = userToken;
    const syncUrl = `${window.location.origin}${window.location.pathname}?sync_token=${userToken}`;
    const qrImg = document.getElementById('qr-code-img');
    if (qrImg) qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&data=${encodeURIComponent(syncUrl)}`;
    document.getElementById('modal-sync-overlay').classList.remove('hidden');
}

function fecharModalSync() {
    document.getElementById('modal-sync-overlay').classList.add('hidden');
}

async function copiarTokenWishlist() {
    try {
        await navigator.clipboard.writeText(userToken);
        alert('Token copiado para a área de transferência!');
    } catch {
        prompt('Copie seu token:', userToken);
    }
}

function vincularNovoToken() {
    const input = document.getElementById('input-sync-token');
    if (!input || !input.value.trim()) return;
    const novoToken = input.value.trim().toUpperCase();
    if (novoToken === userToken) {
        alert('Este já é o seu token atual!');
        return;
    }
    
    localStorage.removeItem('rt_settings_backup');
    configuracoesUsuario = {};

    userToken = novoToken;
    localStorage.setItem('rt_user_token', userToken);
    alert(`Dispositivo vinculado com sucesso ao Token: ${userToken}\nCarregando sua Wishlist...`);
    fecharModalSync();
    carregarWishlistDoServidor();
    carregarJogos(); // Recarrega os feeds e configurações do novo token
}

function verificarTokenSincroniaURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const syncToken = urlParams.get('sync_token');
    if (syncToken && syncToken.trim()) {
        localStorage.removeItem('rt_settings_backup');
        configuracoesUsuario = {};

        userToken = syncToken.trim().toUpperCase();
        localStorage.setItem('rt_user_token', userToken);
        urlParams.delete('sync_token');
        const novaUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        history.replaceState({}, '', novaUrl);
        alert(`Sincronizado com sucesso via QR Code!\nToken: ${userToken}`);
    }
}
// --- FIM: NOVAS FUNÇÕES EXCLUSIVAS PARA CONTROLE DA WISHLIST ---

// ============================================================================
// --- INÍCIO: INTEGRAÇÃO TORBOX UNIFICADA (CACHE MD5 + AUTO VIP) ---
// ============================================================================

async function buscarDownloadsTorbox(downloads) {
    const secaoTorbox = document.getElementById('modal-section-torbox');
    const gridTorbox = document.getElementById('modal-torbox-grid');
    const statusTag = document.getElementById('torbox-status-tag');
    if (!secaoTorbox || !gridTorbox) return;

    gridTorbox.innerHTML = '';
    statusTag.textContent = "Verificando Torbox...";
    statusTag.className = "text-[10px] bg-neutral-900 border border-neutral-800 text-amber-400 px-2 py-0.5 rounded font-mono animate-pulse";
    secaoTorbox.classList.remove('hidden');
    atualizarVisibilidadeAtalho('torbox', true);

    const todosOsLinks = downloads.map(dl => dl.url);

    if (todosOsLinks.length === 0) {
        statusTag.textContent = "Sem links disponíveis";
        statusTag.className = "text-[10px] bg-neutral-900 border border-neutral-800 text-neutral-500 px-2 py-0.5 rounded font-mono";
        gridTorbox.innerHTML = `<div class="col-span-full text-center py-4 text-xs text-neutral-500 bg-neutral-950/40 rounded border border-neutral-800/60">Este release não possui links para verificação.</div>`;
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URL}/api/torbox-proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'check-cache', links: todosOsLinks })
        });
        const data = await res.json();
        const torboxItems = data.items || [];

        if (torboxItems.length > 0) {
            statusTag.textContent = `${torboxItems.length} disponível(is)`;
            statusTag.className = "text-[10px] bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded font-mono font-bold";

            // Renderiza os botões unificados com AUTO VIP para Torrents e Web Downloads em cache
            gridTorbox.innerHTML = torboxItems.map((item, idx) => `
                <button type="button" id="btn-tb-${idx}" onclick="executarDownloadTorbox('${encodeURIComponent(item.url)}', 'btn-tb-${idx}', '${item.type}')" class="w-full bg-emerald-950/30 hover:bg-emerald-900/50 p-2.5 flex items-center justify-between gap-2 rounded text-xs font-bold text-emerald-300 border border-emerald-500/40 transition-all shadow-sm group cursor-pointer" title="${item.url}">
                    <div class="flex items-center gap-2 truncate">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400 group-hover:scale-110 transition-transform shrink-0"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                        <span class="truncate">${item?.label.startsWith('magnet:') ? 'TORRENT' : item?.label.replace('www.', '').toUpperCase().split('.')[0]}</span>
                    </div>
                    <span class="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded uppercase font-mono shrink-0">CACHED</span>
                </button>
            `).join('');
        } else {
            statusTag.textContent = "Sem cache";
            statusTag.className = "text-[10px] bg-neutral-900 border border-neutral-800 text-neutral-500 px-2 py-0.5 rounded font-mono";
            gridTorbox.innerHTML = `<div class="col-span-full text-center py-4 text-xs text-neutral-500 bg-neutral-950/40 rounded border border-neutral-800/60">Nenhum link encontrado no cache do Torbox.</div>`;
        }
    } catch (e) {
        console.error("Erro ao verificar Torbox:", e);
        statusTag.textContent = "Erro na consulta";
        statusTag.className = "text-[10px] bg-red-950/30 border border-red-800/40 text-red-400 px-2 py-0.5 rounded font-mono";
        gridTorbox.innerHTML = `<div class="col-span-full text-center py-4 text-xs text-red-400/80">Falha ao se comunicar com o serviço do Torbox.</div>`;
    }
}

async function executarDownloadTorbox(urlEncoded, btnId, type) {
    const btn = document.getElementById(btnId);
    const urlDecoded = decodeURIComponent(urlEncoded);

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `
            <div class="flex items-center justify-center gap-2 w-full text-amber-300">
                <svg class="animate-spin h-4 w-4 text-amber-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span>Gerando Link VIP...</span>
            </div>
        `;
    }

    try {
        const res = await fetch(`${API_BASE_URL}/api/torbox-proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add-and-download', url: urlDecoded, type: type })
        });
        const data = await res.json();

        if (data && data.success && data.downloadUrl) {
            if (btn) {
                btn.className = "w-full bg-emerald-600 text-white p-2.5 flex items-center justify-center gap-2 rounded text-xs font-bold transition-all shadow-md";
                btn.innerHTML = `<span>✔ Download Iniciado!</span>`;
            }
            window.open(data.downloadUrl, '_blank');
        } else {
            throw new Error(data.error || "Não foi possível resgatar o link direto.");
        }
    } catch (e) {
        console.error("Erro ao gerar link VIP Torbox:", e);
        alert(`Erro ao iniciar download pelo Torbox:\n${e.message}`);
        if (btn) {
            btn.disabled = false;
            btn.className = "w-full bg-red-950/40 hover:bg-red-900/50 p-2.5 flex items-center justify-between gap-2 rounded text-xs font-bold text-red-300 border border-neutral-700 transition-all cursor-pointer";
            btn.innerHTML = `<span>Tentar Novamente ✕</span>`;
        }
    }
}
// ============================================================================
// --- FIM: INTEGRAÇÃO TORBOX UNIFICADA ---
// ============================================================================


// ============================================================================
// --- INÍCIO: IMPLEMENTAÇÃO DE NOTIFICAÇÕES PUSH ---
// ============================================================================

const VAPID_PUBLIC_KEY = 'BEhE1RfL8fm9fCNq9XgB1tyBaeQWtodWyJX-61TMMj5-4MmL3jAU1wAvEyhi3BsCSMDUc5etZwwIiGNt7lBFRBM';

// Converte a chave VAPID base64 para Uint8Array (exigido pelo navegador)
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function assinarNotificacoes() {
    
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('Seu navegador não possui suporte a Notificações Push em segundo plano.');
        return;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();

        // Se já for assinado, podemos avisar ou não fazer nada
        if (subscription) {
            alert('Seu dispositivo já está ativo para receber alertas de novos releases!');
            atualizarBotaoNotificacaoUI(true);
            return;
        }

        // Pede permissão e assina no PushManager do navegador
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        // Envia a inscrição para o nosso endpoint no Vercel KV
        const res = await fetch(`${API_BASE_URL}/api/push-subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subscription: subscription,
                token: userToken // Atrela a inscrição ao userToken da sua sessão
            })
        });

        if (res.ok) {
            alert('Alerta ativado! Você receberá notificações neste dispositivo quando novos jogos surgirem.');
            atualizarBotaoNotificacaoUI(true);
        } else {
            throw new Error('Falha ao registrar no servidor.');
        }
    } catch (err) {
        console.error('Erro na assinatura de notificações:', err);
        if (Notification.permission === 'denied') {
            alert('Você bloqueou as notificações para este site. Libere nas configurações do seu navegador.');
        } else {
            alert('Erro ao ativar notificações. Tente novamente mais tarde.');
        }
    }
}

function atualizarBotaoNotificacaoUI(ativo) {
    const btn = document.getElementById('btn-header-notify');
    const icon = document.getElementById('icon-notify');
    const text = document.getElementById('text-notify');
    if (!btn || !icon || !text) return;

    if (ativo) {
        btn.classList.add('border-emerald-500/50', 'bg-emerald-950/30', 'text-emerald-400');
        icon.classList.remove('text-neutral-500');
        icon.classList.add('text-emerald-400');
        text.textContent = 'Alerta Ativo';
    } else {
        btn.classList.remove('border-emerald-500/50', 'bg-emerald-950/30', 'text-emerald-400');
        icon.classList.add('text-neutral-500');
        icon.classList.remove('text-emerald-400');
        text.textContent = 'Notificações';
    }
}

async function verificarStatusNotificacao() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            atualizarBotaoNotificacaoUI(true);
        }
    } catch (e) {
        console.log('Verificação inicial de Push silenciosa falhou:', e);
    }
}

// Executa a checagem no carregamento da página em segundo plano
window.addEventListener('load', () => {
    setTimeout(verificarStatusNotificacao, 1500);
});

// ============================================================================
// --- FIM: IMPLEMENTAÇÃO DE NOTIFICAÇÕES PUSH --- 
// ============================================================================

// Exibe a barra flutuante no bottom assim que o usuário rolar 180px para baixo no modal
document.getElementById('modal-overlay')?.addEventListener('scroll', function () {
    const floatingNav = document.getElementById('modal-floating-shortcuts');
    if (!floatingNav) return;

    if (this.scrollTop > 180) {
        floatingNav.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
        floatingNav.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
    } else {
        floatingNav.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
        floatingNav.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
    }
});