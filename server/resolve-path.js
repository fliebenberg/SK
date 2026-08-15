try {
    const path = require.resolve('@sk/shared');
    console.log('Resolved @sk/shared to:', path);
} catch (e) {
    console.error('Failed to resolve @sk/shared');
}
