let jogosOriginaisFeedly = [];
let jogosCarregados = [];
let termoPesquisado = '';
let fonteAtual = 'feedly'; // 'feedly' ou 'steam'
let modalJogoAtual = null;
let viewMode = localStorage.getItem('viewMode') || 'covers';

// --- INÍCIO: IMPLEMENTAÇÃO DA WISHLIST (VARIÁVEIS E TOKEN) ---
let wishlistJogos = [];
let userToken = localStorage.getItem('rt_user_token');

if (!userToken) {
    userToken = 'RT-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    localStorage.setItem('rt_user_token', userToken);
}
// --- FIM: IMPLEMENTAÇÃO DA WISHLIST ---

const IS_LOCAL = window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1' || 
                 window.location.protocol === 'file:';
const API_BASE_URL = IS_LOCAL ? 'https://tracker-steam.vercel.app' : '';
const STREAM_ID = 'feed%2Fhttps%2F%2Fwww.skidrowreloaded.com%2Fcategory%2Fpc-games%2Ffeed%2F';
const PROXY_BASE_URL = `${API_BASE_URL}/api/steam-proxy?appid=`;
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

// --- INÍCIO: GESTÃO DE CONFIGURAÇÕES DO USUÁRIO E ITENS NOVOS ---
let configuracoesUsuario = {};

async function carregarConfiguracoesServidor() {
    try {
        // Adapte para a forma como você armazena o token do usuário no frontend
        const token = localStorage.getItem('rt_token'); 
        if (!token) return {};
        
        const res = await fetch(`${API_BASE_URL}/api/settings?token=${token}`);
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
        const token = localStorage.getItem('rt_token');
        if (!token) return;

        // Atualização otimista em memória
        configuracoesUsuario = { ...configuracoesUsuario, ...novasConfiguracoes };

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
    // Trava o timestamp no sessionStorage para o F5 não sumir com as tags "NOVO" na mesma sessão
    let sessaoAcesso = sessionStorage.getItem('rt_session_last_visit');
    if (!sessaoAcesso) {
        sessaoAcesso = (configuracoesUsuario.last_visit || 0).toString();
        sessionStorage.setItem('rt_session_last_visit', sessaoAcesso);
    }
    return parseInt(sessaoAcesso, 10);
}

function atualizarUltimoAcessoServidor(jogos) {
    if (!jogos || jogos.length === 0) return;
    
    // Garante que a sessão atual gravou o timestamp antigo antes de enviarmos o novo para o servidor
    getUltimoAcesso();
    
    const maxTimestamp = Math.max(...jogos.map(j => j.published || 0));
    const ultimoServidor = configuracoesUsuario.last_visit || 0;
    
    // Se o feed tem um release mais recente do que o salvo no servidor, atualiza em background
    if (maxTimestamp > ultimoServidor) {
        salvarConfiguracoesServidor({ last_visit: maxTimestamp });
    }
}

function isJogoNovo(jogo) {
    if (fonteAtual !== 'feedly') return false; 
    const ultimoAcesso = getUltimoAcesso();
    return ultimoAcesso > 0 && (jogo.published || 0) > ultimoAcesso;
}
// --- FIM: GESTÃO DE CONFIGURAÇÕES DO USUÁRIO E ITENS NOVOS ---

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
        rawCover: rawImg,
        postLink: postLink,
        downloads,
        date: formatarDataRelativa(item.published),
        published: item.published || 0,
        steamId: steamId,
        links,
        size: size,
        release
    };
}

function criarCardJogo(jogo) {
    const card = document.createElement('div');
    const isNew = isJogoNovo(jogo); // <-- VERIFICAÇÃO SE É NOVO
    
    // Borda verde e sombra adicionadas dinamicamente caso isNew seja true
    card.className = `bg-neutral-900 border ${isNew ? 'border-emerald-700' : 'border-neutral-800'} rounded-lg overflow-hidden cursor-pointer relative hover:border-emerald-500/50 transition-all`;
    card.onclick = () => abrirModal(jogosCarregados.findIndex(j => j.feedlyId === jogo.feedlyId));
    
    // Define o fallback padrão final de segurança (massa de manobra se tudo falhar)
    const fallbackFinal = jogo.fallbackImage || (jogo.steamId ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${jogo.steamId}/header.jpg` : 'https://store.fastly.steamstatic.com/public/images/v6/app_default_header.jpg');
    
    const removeBtnHtml = fonteAtual === 'wishlist' ? `
        <button onclick="removerDaWishlist('${jogo.feedlyId}', event)" title="Remover da Wishlist" class="absolute top-2 left-2 z-20 bg-black/80 hover:bg-red-600/90 text-neutral-300 hover:text-white p-1.5 rounded-full transition-all shadow-md">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
    ` : '';
    // --- FIM: ÍCONE DE REMOÇÃO DA WISHLIST ---

    // --- INÍCIO: TAG NOVO ---
    const tagNovoHtml = isNew ? `
        <span class="absolute top-0 left-0 z-20 bg-emerald-600 text-neutral-950 font-rajdhani font-black text-[13px] px-3.5 py-0.5 rounded shadow-lg tracking-wider uppercase">NOVO</span>
    ` : '';
    // --- FIM: TAG NOVO ---

    card.innerHTML = `
        <div class="aspect-[3/4] bg-neutral-950 relative">
            ${tagNovoHtml}
            ${removeBtnHtml}
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
                 class="w-full object-cover">
        </div>
        <div id="score-${jogo.id}" class="absolute top-2 right-2 bg-black/70 backdrop-blur px-2 py-1 rounded text-[10px] font-bold text-emerald-400 hidden"></div>
        <div class="absolute bottom-12 right-2 bg-black/60 backdrop-blur px-1.5 py-0.5 rounded text-[9px] text-neutral-400 z-10">${jogo.date}</div>
        <div class="p-3 font-bold text-xs line-clamp-2">${jogo.title}</div>
    `;
    return card;
}

function criarCardJogoCompacto(jogo) {
    const card = document.createElement('div');
    const isNew = isJogoNovo(jogo); // <-- VERIFICAÇÃO SE É NOVO

    card.className = `bg-neutral-900 border ${isNew ? 'border-emerald-800' : 'border-neutral-800'} rounded-md overflow-hidden cursor-pointer relative hover:border-emerald-500/50 transition-all p-2.5 flex gap-4 sm:gap-5 w-full group/card`;
    card.onclick = () => abrirModal(jogosCarregados.findIndex(j => j.feedlyId === jogo.feedlyId));
    
    const fallbackFinal = jogo.fallbackImage || (jogo.steamId ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${jogo.steamId}/header.jpg` : 'https://store.fastly.steamstatic.com/public/images/v6/app_default_header.jpg');
    
    const removeBtnHtml = fonteAtual === 'wishlist' ? `
        <button onclick="removerDaWishlist('${jogo.feedlyId}', event)" title="Remover da Wishlist" class="absolute bottom-2.5 right-2.5 text-neutral-500 hover:text-red-400 p-1.5 rounded-md hover:bg-neutral-800 transition-colors z-20">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
    ` : '';

    // --- INÍCIO: TAG NOVO ---
    const tagNovoHtml = isNew ? `
        <span class="absolute top-0 left-0 z-20 bg-emerald-600 text-neutral-950 font-rajdhani font-black text-[9px] px-1 py-0.5 pb-[1px] rounded tracking-wider uppercase">NOVO</span>
    ` : '';
    // --- FIM: TAG NOVO ---

    let tagsHtml = '';
    if (jogo.release.tags && jogo.release.tags.length > 0) {
        tagsHtml = jogo.release.tags.map(tag => `
            <span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold px-1 py-0.5 rounded shadow-sm block mb-1">
                ${tag.toUpperCase()}
            </span>`).join('');
    }

    let html = `
        <div class="w-16 h-24 sm:w-[88px] sm:h-32 shrink-0 bg-neutral-950 rounded overflow-hidden relative border border-neutral-950">
            ${tagNovoHtml}
            <img src="${jogo.cover}" 
                 referrerpolicy="no-referrer" 
                 onerror="if (this.src !== '${jogo.rawCover}' && '${jogo.rawCover}' !== '') { this.src = '${jogo.rawCover}'; } else if (this.src !== '${fallbackFinal}') { this.src = '${fallbackFinal}'; } else { this.onerror = null; }" 
                 class="w-full h-full object-cover">
        </div>
        <div class="flex flex-col justify-between min-w-0 flex-1 relative py-0 pr-1">
            <div class="w-full pr-12">
                <div class="font-rajdhani font-bold text-base text-white tracking-tight leading-tight" title="${jogo.title}">
                    ${jogo.release.tituloOriginal.toUpperCase()}
                </div>
            </div>
            <div class="flex flex-wrap gap-x-6 sm:gap-x-8 gap-y-1.5 mt-3 sm:mt-4 w-full">`;

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
        ${tagsHtml ? `<div class="absolute top-2.5 right-2.5 flex flex-col items-end z-10">${tagsHtml}</div>` : ''}
        ${removeBtnHtml}
        <div id="score-${jogo.id}" class="absolute top-1/2 -translate-y-1/2 right-12 bg-black/70 backdrop-blur px-2 py-1 rounded text-[10px] font-black text-emerald-400 hidden"></div>
    `;

    card.innerHTML = html;
    return card;
}

async function buscarItemFeedlyRemoto(feedlyId) {
    const res = await fetch(`${API_BASE_URL}/api/feedly-entry?id=${encodeURIComponent(feedlyId)}`);
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
    //carregarNotasEmLote();
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

    // --- INÍCIO: CHECAGEM DE WISHLIST VAZIA ---
    if (jogosCarregados.length === 0) {
        if (fonteAtual === 'wishlist') {
            grid.innerHTML = '<div class="col-span-full text-center py-20 text-neutral-500 text-sm">Sua Wishlist está vazia no momento.<br><span class="text-xs text-neutral-600">Adicione jogos acessando os detalhes de qualquer release.</span></div>';
            return;
        }
    }
    // --- FIM: CHECAGEM DE WISHLIST VAZIA ---

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
        /* const res = await fetch(`${API_BASE_URL}/api/feedly-proxy`);
        const data = await res.json(); */

        // --- SUBSTITUA SEU FETCH ANTERIOR POR ESTE PROMISE.ALL ---
        // Dispara em paralelo a busca do feed de jogos E a busca das configurações do servidor
        const [resJogos, configServidor] = await Promise.all([
            fetch(`${API_BASE_URL}/api/feedly-proxy`),
            carregarConfiguracoesServidor()
        ]);

        // Salva na variável global para ser usada pelas funções de verificação
        configuracoesUsuario = configServidor || {};

        const data = await resJogos.json();
        // --- FIM DA ALTERAÇÃO DO FETCH ---

        data.items.forEach((item, index) => {
            const jogo = parseFeedlyItem(item, index);
            jogosCarregados.push(jogo);
        });

        jogosOriginaisFeedly = [...jogosCarregados];

        // Envia o novo timestamp para o servidor em segundo plano (não bloqueia a renderização)
        atualizarUltimoAcessoServidor(jogosCarregados);

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
        const res = await fetch(`${API_BASE_URL}/api/steam-batch?ids=` + steamIds.join(','));
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

    // Adiciona estado ao histórico para que o botão "Voltar" do navegador feche o lightbox
    history.pushState({ lightboxOpen: true }, '', window.location.href);
    
    // Registra navegação por teclado (Setas)
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

window.fecharLightbox = (e, forcar = false, viaPopstate = false) => {
    // Se o clique for direto na imagem ou nos botões de controle, ignora
    if (!forcar && !viaPopstate && e && e.target.id !== 'lightbox') return;
    
    const lightboxEl = document.getElementById('lightbox');
    if (!lightboxEl.classList.contains('hidden')) {
        lightboxEl.classList.add('hidden');
        
        // Se fechou por interação do usuário (clique/tecla), remove o estado extra do histórico
        if (!viaPopstate && history.state?.lightboxOpen) {
            history.back();
        }
    }
    
    // Remove listeners acumulados
    window.removeEventListener('keydown', lidarTecladoLightbox);
    lightboxEl.removeEventListener('touchstart', lidarTouchStart);
    lightboxEl.removeEventListener('touchend', lidarTouchEnd);
};

// Navegação via teclado
function lidarTecladoLightbox(e) {
    if (e.key === 'ArrowLeft') {
        navegarLightbox(null, -1);
    } else if (e.key === 'ArrowRight') {
        navegarLightbox(null, 1);
    } else if (e.key === 'Escape') {
        fecharLightbox(null, true);
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
    
    // --- INÍCIO: CHECAR SE O JOGO ATUAL ESTÁ NA WISHLIST ---
    atualizarBotaoWishlistModal(estaNaWishlist(jogo.feedlyId));
    // --- FIM: CHECAR SE O JOGO ATUAL ESTÁ NA WISHLIST ---

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
    document.getElementById('modal-section-similares')?.classList.add('hidden');

    // Esconde os botões correspondentes que são assíncronos na barra da navegação
    ['hltb', 'recursos', 'screenshots', 'videos', 'reviews', 'similares'].forEach(sec => {
        document.getElementById(`shortcut-${sec}`)?.classList.add('hidden');
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
    document.body.style.overflow = 'hidden';
    rolarParaSecaoModal('modal-content');

    if (jogo.steamId) {
        buscarDadosSteam(jogo.steamId);
        buscarHowLongToBeat(jogo.steamId);
        buscarReviewsSteam(jogo.steamId);
        buscarJogosSimilares(jogo.steamId);
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

        document.getElementById('modal-description').innerHTML = game.detailed_description || game.short_description || "Sem descrição disponível.";

        // Screenshots (Todas)
        if (game.screenshots && game.screenshots.length > 0) {
            document.getElementById('modal-section-screenshots').classList.remove('hidden');
            document.getElementById('shortcut-screenshots')?.classList.remove('hidden');
            
            // Mapeia todas as URLs em alta resolução
            const listaUrls = game.screenshots.map(s => s.path_full);

            document.getElementById('modal-screenshots-grid').innerHTML = game.screenshots.map((s, idx) =>
                `<img src="${s.path_thumbnail}" referrerpolicy="no-referrer" onclick="abrirLightbox(${idx}, ${JSON.stringify(listaUrls).replace(/"/g, '&quot;')})" class="rounded border border-neutral-800 cursor-pointer hover:opacity-80 transition-opacity">`
            ).join('');
        }

        // Recursos (Categorias)
        if (game.categories && game.categories.length > 0) {
            document.getElementById('modal-section-recursos').classList.remove('hidden');
            document.getElementById('shortcut-recursos')?.classList.remove('hidden');
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
            document.getElementById('shortcut-videos')?.classList.remove('hidden');
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
        const res = await fetch(`${API_BASE_URL}/api/steam-reviews?appid=${steamId}`);
        const json = await res.json();

        if (json.success && json.reviews && json.reviews.length > 0) {
            const section = document.getElementById('modal-section-reviews');
            const list = document.getElementById('modal-reviews-list');

            //Nota cabeçalho e seção de avaliações
            let notaSteam = Math.trunc((json.query_summary.total_positive * 100) / json.query_summary.total_reviews);
            const { bg, border } = getMetacriticColor(notaSteam);

            // 1. Atualiza a nota do Hero/Cabeçalho
            const metaScoreEl = document.getElementById('modal-metacritic-score');
            metaScoreEl.className = `absolute bottom-4 right-4 h-16 w-16 flex flex-col items-center justify-center rounded-lg border-2 ${border} ${bg} shadow-xl [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]`;
            document.getElementById('metacritic-score-value').textContent = notaSteam;

            // 2. Atualiza a nota na Seção de Avaliações (Sombra, fonte maior e alinhado à direita)
            const reviewsSectionScoreEl = document.getElementById('reviews-section-score');
            if (reviewsSectionScoreEl) {
                reviewsSectionScoreEl.textContent = `${notaSteam}`;
                reviewsSectionScoreEl.className = `inline-flex items-center justify-center ${bg} border ${border} px-1.5 py-0.5 rounded text-base font-black text-white shadow-md leading-none ml-auto [text-shadow:0_1px_3px_rgba(0,0,0,0.8)] tracking-tight`;
            }

            //Total avaliações
            const totalReviews = json?.query_summary?.total_reviews?.toLocaleString('pt-BR') || 0;
            document.getElementById('total-reviews').innerHTML = `<span class="text-neutral-500">Avaliações:</span> ${totalReviews}`;

            section.classList.remove('hidden');
            document.getElementById('shortcut-reviews')?.classList.remove('hidden');
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
                        <div class="bg-neutral-800/30 border border-neutral-800 p-4 rounded-md">
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
        document.getElementById('shortcut-hltb')?.classList.remove('hidden');
    } catch (e) {
        console.log("Sem dados no How Long to Beat para este jogo:", steamId);
    }
}

async function buscarJogosSimilares(steamId) {
    const section = document.getElementById('modal-section-similares');
    const container = document.getElementById('modal-similares-grid');
    if (!section || !container) return;

    try {
        const res = await fetch(`${API_BASE_URL}/api/steam-similar?appid=${steamId}`);
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
        document.getElementById('shortcut-similares')?.classList.remove('hidden');
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

    modalJogoAtual = null;
    document.body.style.overflow = '';
    document.getElementById('modal-overlay').classList.add('hidden');
}
function fecharModalFora(e) { if (e.target.id === 'modal-overlay') fecharModal(); }

// --- Lógica de Busca ---

async function executarBusca(termo) {
    termoPesquisado = termo;
    
    // --- INÍCIO: ESCONDER BANNER WISHLIST NA BUSCA ---
    document.getElementById('wishlist-filter-tag')?.classList.add('hidden');
    // --- FIM: ESCONDER BANNER WISHLIST NA BUSCA ---
    
    // Mostra o container de filtros
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
        // Busca remota no Skidrow via Scraping (substituindo busca Feedly que dá 401)
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
                //carregarNotasEmLote();
            }
        } catch (err) {
            console.error("Erro busca Skidrow:", err);
            grid.innerHTML = '<div class="col-span-full text-red-500 text-center py-20">Erro ao buscar no Skidrow.</div>';
        }
    } else {
        // Busca na API da Steam
        try {
            const res = await fetch(`${API_BASE_URL}/api/steam-search?term=${encodeURIComponent(termo)}`);
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
                //carregarNotasEmLote();
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

    // --- INÍCIO: ALTERAR COMPORTAMENTO LIMPAR BUSCA PARA WISHLIST ---
    if (fonteAtual === 'wishlist') {
        jogosCarregados = [...wishlistJogos];
    } else {
        jogosCarregados = [...jogosOriginaisFeedly];
    }
    // --- FIM: ALTERAR COMPORTAMENTO LIMPAR BUSCA PARA WISHLIST ---
    
    renderizarJogos();
    //carregarNotasEmLote();
}

// --- LÓGICA DA BARRA DE ATALHOS NO MODAL ---

// Função que rola suavemente para o destino escolhido compensando a altura da barra minimalista
function rolarParaSecaoModal(elementId) {
    const alvo = document.getElementById(elementId);
    if (!alvo) return;
    
    // Altura da barra compacta em pixels para que o título da seção não fique escondido sob ela
    const compensacao = 47; 
    
    const modalContainer = document.getElementById('modal-overlay');
    
    // Se o clique for em "Topo", rola diretamente para o início absoluto do modal
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

// Inicialização principal
carregarJogos();

window.addEventListener('popstate', () => {
    const lightbox = document.getElementById('lightbox');
    if (lightbox && !lightbox.classList.contains('hidden')) {
        fecharLightbox(null, true, true);
        return;
    }

    const modal = document.getElementById('modal-overlay');
    if (modal && !modal.classList.contains('hidden')) {
        fecharModal(true);
    }
});

// PWA: Registrar Service Worker para aceitar instalação do app no navegador mobile
if ('serviceWorker' in navigator) {
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
            atualizarContadorWishlist();
            if (fonteAtual === 'wishlist') renderizarJogos();
        }
    } catch (err) {
        console.error("Erro ao carregar Wishlist remota:", err);
        const savedLocal = localStorage.getItem('rt_wishlist_backup');
        if (savedLocal) {
            wishlistJogos = JSON.parse(savedLocal);
            atualizarContadorWishlist();
        }
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
    userToken = novoToken;
    localStorage.setItem('rt_user_token', userToken);
    alert(`Dispositivo vinculado com sucesso ao Token: ${userToken}\nCarregando sua Wishlist...`);
    fecharModalSync();
    carregarWishlistDoServidor();
}

function verificarTokenSincroniaURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const syncToken = urlParams.get('sync_token');
    if (syncToken && syncToken.trim()) {
        userToken = syncToken.trim().toUpperCase();
        localStorage.setItem('rt_user_token', userToken);
        urlParams.delete('sync_token');
        const novaUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        history.replaceState({}, '', novaUrl);
        alert(`Sincronizado com sucesso via QR Code!\nToken: ${userToken}`);
    }
}
// --- FIM: NOVAS FUNÇÕES EXCLUSIVAS PARA CONTROLE DA WISHLIST ---