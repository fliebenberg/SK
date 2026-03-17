import { SocketAction } from './src/index'; 
// Wait, I should import from @sk/types
import { SocketAction as SA } from '@sk/types';

console.log('SocketAction.RESET_GAME:', SA.RESET_GAME);
console.log('Available actions:', Object.keys(SA));
