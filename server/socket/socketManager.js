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
      
      // Enviar datos iniciales
      socket.emit('initial-data', this.dataSimulator.getAllDesks());
      socket.emit('stats-update', this.dataSimulator.getStats());
      
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
    this.updateInterval = setInterval(() => {
      // Generar cambios aleatorios
      const changedDesks = this.dataSimulator.simulateRandomChanges();
      
      if (changedDesks.length > 0 && this.connectedClients.size > 0) {
        // Emitir cambios a todos los clientes
        this.io.emit('desks-update', changedDesks);
        this.io.emit('stats-update', this.dataSimulator.getStats());
        
        console.log(`📊 Actualización en tiempo real: ${changedDesks.length} puestos modificados`);
      }
    }, 3000); // Actualizar cada 3 segundos
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