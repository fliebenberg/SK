const { io } = require('socket.io-client');
const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('Connected to server, triggering cache reset...');
  // SocketAction.RESET_CACHE is usually 'RESET_CACHE'
  socket.emit('action', { type: 'RESET_CACHE' }, (response) => {
    console.log('Server response:', response);
    socket.disconnect();
    process.exit(0);
  });
});

socket.on('connect_error', (err) => {
  console.error('Connection error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log('Timeout waiting for server response.');
  process.exit(1);
}, 5000);
