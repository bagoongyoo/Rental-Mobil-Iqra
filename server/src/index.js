require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initSocket } = require('./sockets');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Inisialisasi Socket.IO pada HTTP server yang sama
initSocket(server);

server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 Server Rental Mobil Iqra berjalan di port ${PORT}`);
  console.log(`📡 Health Check : http://localhost:${PORT}/api/health`);
  console.log(`🔌 Socket.IO    : Aktif`);
  console.log(`==================================================`);
});
