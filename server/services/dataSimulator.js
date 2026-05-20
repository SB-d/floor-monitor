const { generateDesksData } = require('../data/desksData');

class DataSimulator {
  constructor() {
    this.desks = generateDesksData();
    this.stats = this.calculateStats();
    
    // Campañas predefinidas
    this.campaigns = [
      'Ventas Premium', 'Soporte Técnico', 'Atención al Cliente',
      'Cobranzas', 'Fidelización', 'Retención', 'Telemarketing',
      'Encuestas', 'WhatsApp Business', 'Redes Sociales'
    ];
    
    // Nombres de agentes
    this.agents = [
      'Ana García', 'Carlos López', 'María Rodríguez', 'José Martínez',
      'Laura Sánchez', 'Pedro Gómez', 'Carmen Díaz', 'Javier Fernández',
      'Isabel Ruiz', 'Miguel Ángel', 'Sofía Moreno', 'David Jiménez',
      'Elena Torres', 'Pablo Navarro', 'Rosa Vázquez', 'Andrés Ramos'
    ];
  }
  
  calculateStats() {
    const stats = {
      total: this.desks.length,
      online: 0,
      busy: 0,
      pause: 0,
      offline: 0,
      error: 0
    };
    
    this.desks.forEach(desk => {
      stats[desk.status]++;
    });
    
    return stats;
  }
  
  getAllDesks() {
    return this.desks;
  }
  
  getDeskById(id) {
    return this.desks.find(desk => desk.id === id);
  }
  
  getStats() {
    this.stats = this.calculateStats();
    return this.stats;
  }
  
  simulateRandomChanges() {
    const numberOfChanges = Math.floor(Math.random() * 3) + 1; // 1-3 cambios
    const changedDesks = [];
    
    for (let i = 0; i < numberOfChanges; i++) {
      const randomIndex = Math.floor(Math.random() * this.desks.length);
      const desk = this.desks[randomIndex];
      
      // Cambiar estado aleatoriamente
      const currentStatusIndex = Object.keys(this.stats).indexOf(desk.status);
      const newStatus = this.getRandomStatus();
      
      if (desk.status !== newStatus) {
        desk.status = newStatus;
        
        // Actualizar otros datos
        if (newStatus === 'online' || newStatus === 'busy') {
          const randomAgent = this.agents[Math.floor(Math.random() * this.agents.length)];
          const randomCampaign = this.campaigns[Math.floor(Math.random() * this.campaigns.length)];
          desk.agent = randomAgent;
          desk.campaign = randomCampaign;
          desk.extension = `3${Math.floor(Math.random() * 900) + 100}`;
        } else if (newStatus === 'pause') {
          desk.agent = desk.agent || 'En pausa';
          desk.campaign = 'Ausente temporal';
        } else if (newStatus === 'offline') {
          desk.agent = 'No asignado';
          desk.campaign = 'Desconectado';
          desk.extension = null;
        } else if (newStatus === 'error') {
          desk.agent = 'Error técnico';
          desk.campaign = 'Soporte requerido';
          desk.extension = null;
        }
        
        desk.lastUpdate = new Date();
        changedDesks.push(desk);
      }
    }
    
    return changedDesks;
  }
  
  getRandomStatus() {
    const statuses = ['online', 'busy', 'pause', 'offline', 'error'];
    const weights = [0.3, 0.4, 0.15, 0.1, 0.05]; // Probabilidades
    const random = Math.random();
    let cumulative = 0;
    
    for (let i = 0; i < statuses.length; i++) {
      cumulative += weights[i];
      if (random < cumulative) {
        return statuses[i];
      }
    }
    
    return 'offline';
  }
}

module.exports = { DataSimulator };