const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { SocketManager } = require('./socket/socketManager');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Rutas API
app.get('/api/health', (req, res) => {
  res.json({ status: 'online', timestamp: new Date() });
});

app.get('/api/stats', (req, res) => {
  const stats = SocketManager.getStats();
  res.json(stats);
});

// Inicializar Socket Manager
const socketManager = new SocketManager(io);

// Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Contacta Floor Monitor corriendo en http://localhost:${PORT}`);
  console.log(`📡 WebSocket activo y esperando conexiones`);
});