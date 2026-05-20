class SocketManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.callbacks = {
            onInitialData: [],
            onDesksUpdate: [],
            onStatsUpdate: [],
            onConnectionChange: []
        };
    }
    
    connect() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Socket connected');
            this.isConnected = true;
            this.triggerCallbacks('onConnectionChange', true);
        });
        
        this.socket.on('disconnect', () => {
            console.log('Socket disconnected');
            this.isConnected = false;
            this.triggerCallbacks('onConnectionChange', false);
        });
        
        this.socket.on('initial-data', (data) => {
            console.log('Initial data received', data.length);
            this.triggerCallbacks('onInitialData', data);
        });
        
        this.socket.on('desks-update', (updates) => {
            console.log('Real-time updates', updates.length);
            this.triggerCallbacks('onDesksUpdate', updates);
        });
        
        this.socket.on('stats-update', (stats) => {
            this.triggerCallbacks('onStatsUpdate', stats);
        });
    }
    
    on(event, callback) {
        if (this.callbacks[event]) {
            this.callbacks[event].push(callback);
        }
    }
    
    triggerCallbacks(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(callback => callback(data));
        }
    }
    
    requestDeskUpdate(deskId) {
        if (this.socket && this.isConnected) {
            this.socket.emit('request-desk-update', deskId);
        }
    }
}

window.SocketManager = SocketManager;