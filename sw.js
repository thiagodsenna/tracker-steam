self.addEventListener('push', function(event) {
    // Definimos a URL absoluta do seu domínio para evitar falhas de escopo no Service Worker
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

    // Valida se a capa recebida é uma URL http válida, senão usa o logo padrão
    const imagemCapa = data.cover && data.cover.startsWith('http') ? data.cover : `${DOMAIN_URL}/assets/logo2.png`;

    const options = {
        body: data.body,
        // O ícone pequeno/médio na barra de notificações
        icon: imagemCapa,
        // O banner grande expansível abaixo do texto no Android
        image: imagemCapa,
        // Ícone da barra de status (badge)
        badge: `${DOMAIN_URL}/assets/logo2.png`,
        vibrate: [100, 50, 100],
        data: { 
            url: data.url || `${DOMAIN_URL}/` 
        }
    };

    event.waitUntil(self.registration.showNotification(data.title, options));
});

// Evento para abrir o site ao clicar na notificação
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            if (clientList.length > 0) {
                let client = clientList[0];
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data.url);
            }
        })
    );
});