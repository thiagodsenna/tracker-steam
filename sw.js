// Força o Service Worker novo a assumir o controle imediatamente
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('push', function(event) {
    const DOMAIN_URL = 'https://tracker-steam.vercel.app';
    
    let data = { 
        title: 'Tracker Steam', 
        body: 'Novo lançamento disponível!',
        cover: `${DOMAIN_URL}/assets/logo2.png`, 
        url: `${DOMAIN_URL}/`
    };

    try {
        if (event.data) {
            data = Object.assign(data, event.data.json());
        }
    } catch (e) {
        data.body = event.data.text();
    }

    const imagemCapa = data.cover && data.cover.startsWith('http') ? data.cover : `${DOMAIN_URL}/assets/logo2.png`;
    const uniqueFallbackTag = 'notificacao-' + Date.now() + '-' + Math.round(Math.random() * 1000);

    const options = {
        body: data.body,
        icon: imagemCapa,
        image: imagemCapa,
        badge: `${DOMAIN_URL}/assets/logo2.png`,
        tag: data.id || uniqueFallbackTag,
        renotify: true,
        vibrate: [100, 50, 100],
        data: { 
            url: data.url || `${DOMAIN_URL}/` 
        }
    };

    event.waitUntil(self.registration.showNotification(data.title, options));
});

// Evento para abrir o app já direcionando para o modal do jogo via Deep Link
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const targetUrl = event.notification.data.url;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // Se já houver uma aba aberta do app, foca nela e navega para o jogo
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                if ('focus' in client) {
                    client.focus();
                    if ('navigate' in client) {
                        return client.navigate(targetUrl);
                    }
                }
            }
            // Se nenhuma aba estiver aberta, abre uma nova janela/aba diretamente no jogo
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});