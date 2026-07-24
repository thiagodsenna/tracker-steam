// --- INÍCIO: WEB PUSH NOTIFICATIONS ---
self.addEventListener('push', function(event) {
    if (!(self.Notification && self.Notification.permission === 'granted')) {
        return;
    }
    
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { title: 'Releases Tracker', body: event.data ? event.data.text() : 'Novo lançamento detectado!' };
    }

    const title = data.title || 'Novo Release Disponível!';
    const options = {
        body: data.body || 'Confira os detalhes do jogo recém-lançado na scene.',
        // No protocolo Web Push (Chrome, Android, etc.), a propriedade 'icon' é a responsável 
        // por renderizar a imagem miniatura quadrada alinhada estritamente à ESQUERDA do texto!
        icon: data.cover || '/assets/logo2.png',
        // A propriedade 'image' exibe a capa expandida em formato banner abaixo do texto
        image: data.cover || null,
        badge: '/assets/logo2.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/'
        }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // Se já houver uma aba aberta do Tracker, foca nela
            if (clientList.length > 0) {
                let client = clientList[0];
                for (let i = 0; i < clientList.length; i++) {
                    if (clientList[i].focused) {
                        client = clientList[i];
                    }
                }
                if ('focus' in client) {
                    return client.focus();
                }
            }
            // Caso contrário, abre uma nova aba na URL do release
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data.url || '/');
            }
        })
    );
});
// --- FIM: WEB PUSH NOTIFICATIONS ---