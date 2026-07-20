let jogosOriginaisFeedly = [];
let jogosCarregados = [];
let termoPesquisado = '';
let fonteAtual = 'feedly'; // 'feedly' ou 'steam'
let modalJogoAtual = null;
let viewMode = localStorage.getItem('viewMode') || 'covers';
const STREAM_ID = 'feed%2Fhttps%2F%2Fwww.skidrowreloaded.com%2Fcategory%2Fpc-games%2Ffeed%2F';
const PROXY_BASE_URL = 'https://tracker-steam.vercel.app/api/steam-proxy?appid=';
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
    36: 'ico_pvp.png',
    37: 'ico_pvp.png',
    38: 'ico_coop.png',
    39: 'ico_coop.png',
    41: 'ico_remote_play.png',
    42: 'ico_remote_play.png',
    43: 'ico_remote_play.png',
    44: 'ico_remote_play_together.png',
    47: 'ico_pvp.png',
    48: 'ico_coop.png',
    49: 'ico_pvp.png',
    51: 'ico_workshop.png',
    61: 'ico_hdr.png'
};


const delay = ms => new Promise(res => setTimeout(res, ms));

function renderizarDesenvolvedores(developers) {
    if (!developers?.length) return '';

    const label = developers.length > 1 ? 'Desenvolvedores' : 'Desenvolvedor';
    const primeiro = developers[0];
    const ocultos = developers.length - 1;

    if (ocultos === 0) {
        return `<span class="text-neutral-500">${label}:</span> ${primeiro}`;
    }

    const todos = developers.join(', ');
    return `<span class="text-neutral-500">${label}:</span> <span id="dev-list">${primeiro}</span> <button type="button" id="dev-expand-btn" class="text-emerald-400 hover:text-emerald-300 font-bold cursor-pointer">[+${ocultos}]</button>`;
}

function configurarExpandirDesenvolvedores(developers) {
    document.getElementById('dev-expand-btn')?.addEventListener('click', function () {
        const devList = document.getElementById('dev-list');
        if (devList) devList.textContent = developers.join(', ');
        this.remove();
    });
}

function getMetacriticColor(score) {
    if (score >= 80) return { bg: 'bg-green-600', border: 'border-green-400' };
    if (score >= 70) return { bg: 'bg-yellow-500', border: 'border-yellow-300' };
    if (score >= 50) return { bg: 'bg-yellow-600', border: 'border-yellow-400' };
    if (score >= 35) return { bg: 'bg-orange-500', border: 'border-orange-300' };
    return { bg: 'bg-red-600', border: 'border-red-400' };
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
    let dataPost;
    
    // Verifica se é uma data no formato "MMM DD, YYYY" (Ex: Jul 16, 2026)
    if (isNaN(Date.parse(dataString)) && /^[a-zA-Z]{3}\s\d{1,2},\s\d{4}$/.test(dataString)) {
        const mesesIngles = {
            'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
            'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
        };
        const partes = dataString.replace(',', '').split(' ');
        const mes = mesesIngles[partes[0]];
        const dia = parseInt(partes[1]);
        const ano = parseInt(partes[2]);
        dataPost = new Date(ano, mes, dia);
    } else {
        dataPost = new Date(dataString);
    }

    if (isNaN(dataPost.getTime())) return dataString; // Fallback caso falhe

    const hoje = new Date();
    
    // Zera as horas para comparar apenas os dias
    const d1 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const d2 = new Date(dataPost.getFullYear(), dataPost.getMonth(), dataPost.getDate());
    const diffTempo = d1 - d2;
    const diffDias = Math.floor(diffTempo / (1000 * 60 * 60 * 24));
    
    if (diffDias === 0) return 'Hoje';
    if (diffDias === 1) return 'Ontem';
    if (diffDias < 30) return `Há ${diffDias} dias`;
    
    const diffMeses = Math.floor(diffDias / 30);
    if (diffMeses < 12) return `Há ${diffMeses} ${diffMeses === 1 ? 'mês' : 'meses'}`;

    return dataString;
    //return dataPost.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
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
        // CASO 2: Não possui versão (usa o hífen como início da tag)
        const indiceHifen = stringEntrada.indexOf('-');
        if (indiceHifen !== -1) {
            tituloOriginal = stringEntrada.slice(0, indiceHifen).trim();
            resto = stringEntrada.slice(indiceHifen);
        } else {
            tituloOriginal = stringEntrada.trim();
            resto = "";
        }
    }
    
    // Processamento inicial das tags baseado em hífens e espaços
    const partes = resto.split('-');
    let tags = [];
    
    partes.forEach((parte, index) => {
        if (index === 0) {
            const tagLimpa = parte.trim();
            if (tagLimpa) tags.push(tagLimpa);
        } else {
            const primeiroPedaco = parte.split(' ')[0].trim();
            if (primeiroPedaco) tags.push(primeiroPedaco);
        }
    });

    // ==========================================
    // NOVA REGRA: GARANTIR "Early Access" COMO TAG
    // ==========================================
    const contemEarlyAccess = /early access/i.test(stringEntrada);

    if (contemEarlyAccess) {
        // 1. Se estiver no título, remove e limpa espaços/hífens órfãos que sobrarem
        tituloOriginal = tituloOriginal
            .replace(/early access/i, '')
            .replace(/\s+/g, ' ')   // Remove espaços duplos internos
            .replace(/[- ]+$/, '')   // Remove hífens ou espaços que sobraram no fim
            .replace(/^[- ]+/, '')   // Remove hífens ou espaços que sobraram no início
            .trim();

        // 2. Remove qualquer variação antiga das tags para evitar duplicatas
        tags = tags.filter(tag => tag.toLowerCase() !== "early access");
        
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

function parseFeedlyItem(item, index) {
    const doc = new DOMParser().parseFromString(item.content?.content || item.summary?.content || '', 'text/html');
    const img = item.visual?.url || doc.querySelector('img')?.src || '';
    const textContent = doc.body.textContent || '';
    const sizeMatch = textContent.match(/Size:\s*([\d.,]+\s*[a-zA-Z]+)/i);
    const size = sizeMatch ? sizeMatch[1].trim() : 'Não informado';

    let downloads = [];
    doc.querySelectorAll('a').forEach(a => {
        const href = a.href || '';
        if (href.includes('skidrowreloaded') || href.includes('steampowered') || href.includes('youtube') || href.includes('steamcommunity')) return;
        if (a.textContent.length > 2 && downloads.length < 16) {
            let label = href.startsWith('magnet:') ? 'TORRENT' : new URL(a.href).hostname.replace('www.', '').toUpperCase().split('.')[0];
            downloads.push({ label: label, url: a.href });
        }
    });

    // REGEX MELHORADO: Busca o ID da Steam em links da Loja (store) OU da Comunidade (steamcommunity)
    const steamMatch = item.content?.content?.match(/(?:store\.steampowered\.com|steamcommunity\.com)\/app\/(\d+)/i) 
                    || textContent.match(/(?:store\.steampowered\.com|steamcommunity\.com)\/app\/(\d+)/i);
    const steamId = steamMatch ? steamMatch[1] : null;
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
        postLink: postLink,
        downloads,
        date: formatarDataRelativa(item.published),
        steamId: steamId,
        links,
        size: size,
        release
    };
}

function criarCardJogo(jogo) {
    const card = document.createElement('div');
    card.className = 'bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden cursor-pointer relative hover:border-emerald-500/50 transition-all';
    card.onclick = () => abrirModal(jogo.id);
    const fallbackImage = jogo.steamId ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${jogo.steamId}/header.jpg` : 'https://store.fastly.steamstatic.com/public/images/v6/app_default_header.jpg';
    card.innerHTML = `
        <div class="aspect-[3/4] bg-neutral-950">
            <img src="${jogo.cover}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='${fallbackImage}';" class="w-full h-full object-cover">
        </div>
        <div id="score-${jogo.id}" class="absolute top-2 right-2 bg-black/70 backdrop-blur px-2 py-1 rounded text-[10px] font-bold text-emerald-400 hidden"></div>
        <div class="absolute bottom-12 right-2 bg-black/60 backdrop-blur px-1.5 py-0.5 rounded text-[9px] text-neutral-400 z-10">${jogo.date}</div>
        <div class="p-3 font-bold text-xs line-clamp-2">${jogo.title}</div>
    `;
    return card;
}

function criarCardJogoCompacto(jogo) {
    const card = document.createElement('div');
    card.className = 'bg-neutral-900 border border-neutral-800 rounded-md overflow-hidden cursor-pointer relative hover:border-emerald-500/50 transition-all p-3 flex gap-5 w-full';
    card.onclick = () => abrirModal(jogo.id);
    
    const fallbackImage = jogo.steamId ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${jogo.steamId}/header.jpg` : 'https://store.fastly.steamstatic.com/public/images/v6/app_default_header.jpg';
    // 1. Criamos uma variável de texto para armazenar todo o HTML sem quebrar as tags
    let html = `
        <div class="w-20 h-30 shrink-0 bg-neutral-950 rounded-md overflow-hidden relative">
            <img src="${jogo.cover}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='${fallbackImage}';" class="w-full h-full object-cover">
        </div>
        <div class="flex flex-col justify-between min-w-0 flex-1 relative py-1">
            <div class="flex justify-between items-start gap-4 w-full">
                <div class="font-rajdhani font-bold text-base text-white tracking-wide flex-1 min-w-0 leading-tight" title="${jogo.title}">
                    ${jogo.release.tituloOriginal.toUpperCase()}
                </div>
                <div class="flex flex-col items-end gap-1 shrink-0">`;

    // Verifica se existem tags para renderizar os Badges
    if (jogo.release.tags && jogo.release.tags.length > 0) {
        // Cria um badge separado para CADA tag e junta tudo
        html += jogo.release.tags.map(tag => `
                    <span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold px-1 py-0.5 mb-1 rounded shadow-sm">
                        ${tag.toUpperCase()}
                    </span>`).join('');
    }

    html += `
                </div>
            </div>
            <div class="flex flex-wrap gap-x-8 gap-y-2 mt-4 w-full">`;

    if (jogo.release.versao) {
        html += `
                <div class="flex flex-col text-[11px]">
                    <span class="text-neutral-500">Versão</span>
                    <span class="text-neutral-300 font-medium">${jogo.release.versao}</span>
                </div>`;
    }

    html += `
                <div class="flex flex-col text-[11px]">
                    <span class="text-neutral-500">Tamanho</span>
                    <span class="text-neutral-300 font-medium">${jogo.size}</span>
                </div>
                <div class="flex flex-col text-[11px]">
                    <span class="text-neutral-500">Postado</span>
                    <span class="text-neutral-300 font-medium">${jogo.date}</span>
                </div>
            </div>
        </div>

        <div id="score-${jogo.id}" class="absolute top-1/2 -translate-y-1/2 right-4 bg-black/70 backdrop-blur px-2 py-1 rounded text-[10px] font-bold text-emerald-400 hidden"></div>
    `;

    card.innerHTML = html;

    return card;
}

async function buscarItemFeedlyRemoto(feedlyId) {
    const res = await fetch(`/api/feedly-entry?id=${encodeURIComponent(feedlyId)}`);
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
    carregarNotasEmLote();
}

function updateViewButtons() {
    const btnCovers = document.getElementById('btn-view-covers');
    const btnCompact = document.getElementById('btn-view-compact');
    if (!btnCovers || !btnCompact) return;

    if (viewMode === 'compact') {
        btnCompact.classList.add('bg-neutral-800', 'text-emerald-500');
        btnCompact.classList.remove('text-neutral-400');
        btnCovers.classList.remove('bg-neutral-800', 'text-emerald-500');
        btnCovers.classList.add('text-neutral-400');
    } else {
        btnCovers.classList.add('bg-neutral-800', 'text-emerald-500');
        btnCovers.classList.remove('text-neutral-400');
        btnCompact.classList.remove('bg-neutral-800', 'text-emerald-500');
        btnCompact.classList.add('text-neutral-400');
    }
}

function renderizarJogos() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    
    grid.innerHTML = '';

    if (viewMode === 'compact') {
        grid.className = 'grid grid-cols-1 gap-3';
    } else {
        grid.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4';
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

    try {
        const res = await fetch('/api/feedly-proxy');
        const data = await res.json();

        data.items.forEach((item, index) => {
            const jogo = parseFeedlyItem(item, index);
            jogosCarregados.push(jogo);
        });

        jogosOriginaisFeedly = [...jogosCarregados];

        renderizarJogos();
        await processarDeepLink();

        //carregarNotasEmLote();
    } catch (err) {
        console.error("Erro Feedly:", err);
        grid.innerHTML = `<div class="col-span-full text-red-500 text-center py-20">Erro ao carregar feeds.</div>`;
        await processarDeepLink();
    }
}

async function carregarNotasEmLote() {
    const steamIds = jogosCarregados.map(j => j.steamId).filter(id => id !== null);
    if (steamIds.length === 0) return;

    try {
        // Chamada única para o novo endpoint batch
        const res = await fetch('/api/steam-batch?ids=' + steamIds.join(','));
        const json = await res.json();

        jogosCarregados.forEach((jogo, index) => {
            if (jogo.steamId && json[jogo.steamId]?.success) {
                const game = json[jogo.steamId].data;
                const score = game.metacritic?.score;

                if (score) {
                    const el = document.getElementById(`score-${index}`);
                    if (el) {
                        const { bg, border } = getMetacriticColor(score);
                        el.textContent = score;
                        el.className = `absolute top-2 right-2 ${bg} border ${border} px-2 py-1 rounded text-[10px] font-black text-white shadow-lg`;
                    }
                }
            }
        });
    } catch (e) { console.error("Erro ao buscar notas em lote", e); }
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

window.abrirLightbox = (src) => {
    document.getElementById('lightbox-img').src = src;
    document.getElementById('lightbox').classList.remove('hidden');
};
function fecharLightbox() { document.getElementById('lightbox').classList.add('hidden'); }

async function abrirModal(id, options = {}) {
    const jogo = jogosCarregados[id];
    if (!jogo) return;

    modalJogoAtual = id;

    const shareUrl = getShareUrl(jogo.feedlyId);
    const historyState = { modalOpen: true, gameId: jogo.feedlyId };

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
    document.getElementById('game-size').innerHTML = `<span class="text-neutral-500">Tamanho:</span> ${jogo.size}`;
    document.getElementById('modal-developer').innerHTML = '';

    document.getElementById('steam-metadata').classList.add('hidden');
    document.getElementById('modal-section-screenshots').classList.add('hidden');
    document.getElementById('modal-section-recursos').classList.add('hidden');
    document.getElementById('modal-section-reviews').classList.add('hidden');
    document.getElementById('modal-section-videos').classList.add('hidden');
    document.getElementById('modal-section-hltb')?.classList.add('hidden');

    const metaScoreEl = document.getElementById('modal-metacritic-score');
    metaScoreEl.className = 'absolute bottom-4 right-4 hidden h-16 w-16 flex items-center justify-center rounded-lg border-2 border-white/20 shadow-xl';
    document.getElementById('metacritic-score-value').textContent = '';
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
    document.body.style.overflow = 'hidden';

    if (jogo.steamId) {
        buscarDadosSteam(jogo.steamId);
        buscarHowLongToBeat(jogo.steamId);
        buscarReviewsSteam(jogo.steamId);
    } else {
        document.getElementById('modal-description').textContent = "Sem ID Steam detectado no post original.";
    }
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

        // Metadata e Metacritic
        document.getElementById('steam-metadata').classList.remove('hidden');
        document.getElementById('release-date').innerHTML = `<span class="text-neutral-500">Lançamento:</span> ${formatarDataRelativa(game.release_date.date)}`;
        document.getElementById('modal-genres').innerHTML = `<span class="text-neutral-500">Gêneros:</span> ${game.genres.map(g => g.description).join(', ')}`;
        document.getElementById('modal-developer').innerHTML = renderizarDesenvolvedores(game.developers);
        configurarExpandirDesenvolvedores(game.developers);

        // Metacritic (Nota) - Badge no cabeçalho
        if (game.metacritic) {
            /* const { bg, border } = getMetacriticColor(game.metacritic.score);
            const metaScoreEl = document.getElementById('modal-metacritic-score');
            metaScoreEl.className = `absolute bottom-4 right-4 h-16 w-16 flex flex-col items-center justify-center rounded-lg border-2 ${border} ${bg} shadow-xl`;
            document.getElementById('metacritic-score-value').textContent = game.metacritic.score; */
        }

        document.getElementById('modal-description').innerHTML = game.detailed_description || game.short_description || "Sem descrição disponível.";

        // Screenshots (Todas)
        if (game.screenshots && game.screenshots.length > 0) {
            document.getElementById('modal-section-screenshots').classList.remove('hidden');
            document.getElementById('modal-screenshots-grid').innerHTML = game.screenshots.map(s =>
                `<img src="${s.path_thumbnail}" referrerpolicy="no-referrer" onclick="abrirLightbox('${s.path_full}')" class="rounded border border-neutral-800 cursor-pointer hover:opacity-80">`
            ).join('');
        }

        // Recursos (Categorias)
        if (game.categories && game.categories.length > 0) {
            document.getElementById('modal-section-recursos').classList.remove('hidden');
            document.getElementById('modal-recursos-grid').innerHTML = game.categories.map(c => {
                const iconName = CATEGORY_ICONS[c.id] || 'ico_singlePlayer.png'; // Fallback
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

async function buscarReviewsSteam(steamId) {
    try {
        const res = await fetch(`/api/steam-reviews?appid=${steamId}`);
        const json = await res.json();

        if (json.success && json.reviews && json.reviews.length > 0) {
            const section = document.getElementById('modal-section-reviews');
            const list = document.getElementById('modal-reviews-list');

            //Nota cabeçalho
            let notaSteam = Math.trunc((json.query_summary.total_positive * 100) / json.query_summary.total_reviews);
            const { bg, border } = getMetacriticColor(notaSteam);
            const metaScoreEl = document.getElementById('modal-metacritic-score');
            metaScoreEl.className = `absolute bottom-4 right-4 h-16 w-16 flex flex-col items-center justify-center rounded-lg border-2 ${border} ${bg} shadow-xl`;
            document.getElementById('metacritic-score-value').textContent = notaSteam;

            //Total avaliações
            document.getElementById('total-reviews').innerHTML = `<span class="text-neutral-500">Avaliações:</span> ${json.query_summary.total_reviews.toLocaleString('pt-BR')}`;

            section.classList.remove('hidden');
            // Filtra para manter apenas PT-BR e Inglês
            const filteredReviews = json.reviews.filter(review =>
                review.language === 'brazilian' || review.language === 'english'
            );
            list.innerHTML = filteredReviews.map(r => {

                const iconHtml = r.voted_up
                    ? `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="inline mr-1"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`
                    : `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="inline mr-1"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm10-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/></svg>`;

                const dataFormatada = formatarTimestamp(r.timestamp_updated || r.timestamp_created);

                return `
                        <div class="bg-neutral-800/30 border border-neutral-800 p-4 rounded-xl">
                            <div class="flex items-center gap-2 mb-2 flex-wrap">
                                <span class="${r.voted_up ? 'text-emerald-500' : 'text-red-500'} font-bold text-[10px] tracking-wider uppercase flex items-center">
                                    ${iconHtml} ${r.voted_up ? ' RECOMENDADO' : ' NÃO RECOMENDADO'}
                                </span>
                                <span class="text-neutral-500 text-[10px]">• ${r.author.playtime_forever ? Math.round(r.author.playtime_forever / 60) + 'h' : '0h'}</span>
                                ${r.votes_up > 0 ? `
                                <span class="text-neutral-500 text-[10px] flex items-center gap-1">
                                    • <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-neutral-400 inline"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                                    ${r.votes_up}
                                </span>` : ''}
                                <span class="text-neutral-500 text-[10px] ml-auto">${dataFormatada}</span>
                            </div>
                            <div>
                                <div class="text-[12px] text-neutral-400 line-clamp-4 break-words">${r.review.replace(/\n/g, '<br>')}</div>
                                ${r.review.length > 250 || r.review.split('\n').length > 4 ? `
                                <button onclick="this.previousElementSibling.classList.toggle('line-clamp-4'); this.textContent = this.previousElementSibling.classList.contains('line-clamp-4') ? 'Mais' : 'Menos';" class="block ml-auto text-[11px] text-neutral-200 font-bold mt-1 hover:text-emerald-400 transition-colors">Mais</button>
                                ` : ''}
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
        const res = await fetch(`/api/hltb-proxy?appid=${steamId}`);
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
    } catch (e) {
        console.log("Sem dados no How Long to Beat para este jogo:", steamId);
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

    modalJogoAtual = null;
    document.body.style.overflow = '';
    document.getElementById('modal-overlay').classList.add('hidden');
}
function fecharModalFora(e) { if (e.target.id === 'modal-overlay') fecharModal(); }

// --- Lógica de Busca ---

async function executarBusca(termo) {
    termoPesquisado = termo;
    
    // Mostra o container de filtros
    const filterTag = document.getElementById('search-filter-tag');
    if (filterTag) filterTag.classList.remove('hidden');
    
    // Atualiza o texto do termo pesquisado
    const termText = document.getElementById('search-term-text');
    if (termText) termText.textContent = `"${termo}"`;

    // Atualiza o estilo visual dos botões de filtro
    atualizarEstiloBotoesFiltro();

    const grid = document.getElementById('grid');
    grid.innerHTML = '<div class="col-span-full text-center py-20 text-emerald-500 animate-pulse">Buscando...</div>';

    if (fonteAtual === 'feedly') {
        // Busca remota no Skidrow via Scraping (substituindo busca Feedly que dá 401)
        try {
            const res = await fetch(`/api/skidrow-search?query=${encodeURIComponent(termo)}`);
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
                carregarNotasEmLote();
            }
        } catch (err) {
            console.error("Erro busca Skidrow:", err);
            grid.innerHTML = '<div class="col-span-full text-red-500 text-center py-20">Erro ao buscar no Skidrow.</div>';
        }
    } else {
        // Busca na API da Steam
        try {
            const res = await fetch(`/api/steam-search?term=${encodeURIComponent(termo)}`);
            const data = await res.json();
            
            jogosCarregados = (data.items || []).map((item, index) => {
                const steamId = item.id;
                const cover = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamId}/library_600x900.jpg`;
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
                    postLink: postLink,
                    downloads: [],
                    date: 'Steam',
                    steamId: steamId.toString(),
                    links,
                    size: 'Não informado',
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
                carregarNotasEmLote();
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
        btnFeedly.className = "px-3 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-bold transition-all";
        btnSteam.className = "px-3 py-1 rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white transition-all";
    } else {
        btnSteam.className = "px-3 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-bold transition-all";
        btnFeedly.className = "px-3 py-1 rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white transition-all";
    }
}

function limparBusca() {
    termoPesquisado = '';
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    const filterTag = document.getElementById('search-filter-tag');
    if (filterTag) filterTag.classList.add('hidden');

    jogosCarregados = [...jogosOriginaisFeedly];
    renderizarJogos();
    carregarNotasEmLote();
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

// Inicialização principal
carregarJogos();

window.addEventListener('popstate', () => {
    const modal = document.getElementById('modal-overlay');
    if (modal && !modal.classList.contains('hidden')) {
        fecharModal(true);
    }
});
