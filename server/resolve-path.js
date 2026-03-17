try {
    const path = require.resolve('@sk/types');
    console.log('Resolved @sk/types to:', path);
} catch (e) {
    console.error('Failed to resolve @sk/types');
}
