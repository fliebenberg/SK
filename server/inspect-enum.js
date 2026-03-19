const path = require('path');
try {
    const skTypes = require(path.resolve(__dirname, '../shared/dist/index'));
    console.log('SocketAction enum:', skTypes.SocketAction);
    console.log('SocketAction.RESET_GAME:', skTypes.SocketAction.RESET_GAME);
} catch (e) {
    console.error('Error loading types:', e.message);
}
