function generateDesksData() {
  const desks = [];
  const rows = 8;
  const cols = 5;
  
  // Campañas para asignar
  const campaigns = [
    'Ventas Premium', 'Soporte Técnico', 'Atención al Cliente',
    'Cobranzas', 'Fidelización', 'Retención'
  ];
  
  // Nombres de agentes
  const agents = [
    'Ana García', 'Carlos López', 'María Rodríguez', 'José Martínez',
    'Laura Sánchez', 'Pedro Gómez', 'Carmen Díaz', 'Javier Fernández',
    'Isabel Ruiz', 'Miguel Ángel', 'Sofía Moreno', 'David Jiménez',
    'Elena Torres', 'Pablo Navarro', 'Rosa Vázquez', 'Andrés Ramos',
    'Mónica Castro', 'Ricardo Soto', 'Patricia Méndez', 'Fernando Ruiz',
    'Verónica Sánchez', 'Raúl González', 'Natalia Flores', 'Sergio Díaz',
    'Beatriz Romero', 'Héctor Muñoz', 'Teresa Vargas', 'Jorge Silva',
    'Gabriela Ortega', 'Luis Fernández', 'Marcela Herrera', 'Roberto Cruz'
  ];
  
  // Estados disponibles
  const statuses = ['online', 'busy', 'pause', 'offline', 'error'];
  
  let deskId = 1;
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Posicionamiento estratégico similar a un grid
      const x = 50 + (col * 130);
      const y = 50 + (row * 100);
      
      // Determinar estado basado en distribución realista
      let status;
      if (row < 2) {
        status = statuses[Math.floor(Math.random() * 0.7 > 0.3 ? 0 : 1)];
      } else if (row > 5) {
        status = statuses[Math.floor(Math.random() * 0.8)];
      } else {
        status = statuses[Math.floor(Math.random() * statuses.length)];
      }
      
      // Generar datos realistas
      const hasAgent = status === 'online' || status === 'busy';
      const agent = hasAgent ? agents[Math.floor(Math.random() * agents.length)] : null;
      const campaign = hasAgent ? campaigns[Math.floor(Math.random() * campaigns.length)] : null;
      const extension = hasAgent ? `3${Math.floor(Math.random() * 900) + 100}` : null;
      
      desks.push({
        id: deskId,
        x: x,
        y: y,
        status: status,
        agent: agent,
        extension: extension,
        campaign: campaign,
        lastUpdate: new Date()
      });
      
      deskId++;
    }
  }
  
  return desks;
}

module.exports = { generateDesksData };