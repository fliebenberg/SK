import { SocketAction } from './src/index'; 
// Wait, I should import from @sk/shared
import { SocketAction as SA } from '@sk/shared';

console.log('SocketAction.RESET_GAME:', SA.RESET_GAME);
console.log('Available actions:', Object.keys(SA));
