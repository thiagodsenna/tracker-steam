self.addEventListener('push', function(event) {
    let data = { 
        title: 'Tracker Steam', 
        body: 'Novo lançamento disponível!',
        cover: '/assets/logo2.png', // Fallback caso o jogo não tenha capa
        url: '/'
    };

    try {
        if (event.data) {
            data = Object.assign(data, event.data.json());
        }
    } catch (e) {
        data.body = event.data.text();
    }

    const options = {
        body: data.body,
        
        // 1. Substitui o círculo cinza (onde estava o "T") pela capa ou logo
        icon: data.cover || '/assets/logo2.png',
        
        // 2. Cria o BANNER GRANDE com a capa do jogo abaixo do texto no Android
        image: data.cover,
        
        // 3. Ícone monocromático para a barra de status minúscula (padrão Android)
        badge: '/assets/logo2.png',
        
        data: { 
            url: data.url || '/' 
        }
    };

    event.waitUntil(self.registration.showNotification(data.title, options));
});

// Evento para abrir o site ao clicar na notificação
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});