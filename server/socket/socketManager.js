const { DataSimulator } = require('../services/dataSimulator');

class SocketManager {
  constructor(io) {
    this.io = io;
    this.dataSimulator = new DataSimulator();
    this.connectedClients = new Set();
    this.updateInterval = null;
    
    this.initialize();
  }

  initialize() {
    this.io.on('connection', (socket) => {
      console.log(`✅ Cliente conectado: ${socket.id}`);
      this.connectedClients.add(socket.id);
      
      // Los datos reales vienen de Supabase (cliente los carga directamente).
      // El socket solo notifica cambios de estado en tiempo real desde
      // integraciones externas (PATCH /api/desks/:id/status).
      socket.emit('initial-data', []);
      socket.emit('stats-update', { total: 0, online: 0, busy: 0, pause: 0, offline: 0, error: 0 });
      
      // Escuchar eventos del cliente
      socket.on('request-desk-update', (deskId) => {
        const desk = this.dataSimulator.getDeskById(deskId);
        if (desk) {
          socket.emit('desk-update', desk);
        }
      });
      
      socket.on('disconnect', () => {
        console.log(`❌ Cliente desconectado: ${socket.id}`);
        this.connectedClients.delete(socket.id);
      });
    });
    
    // Iniciar simulador de cambios en tiempo real
    this.startRealTimeUpdates();
  }
  
  startRealTimeUpdates() {
    // Simulador desactivado — los estados los gestiona Supabase Realtime.
    // El servidor solo reenvía cambios que llegan desde integraciones externas
    // vía PATCH /api/desks/:id/status, no genera cambios aleatorios propios.
  }
  
  getStats() {
    return this.dataSimulator.getStats();
  }
  
  stopUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }
}

module.exports = { SocketManager };