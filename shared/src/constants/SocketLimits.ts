/**
 * The largest action the app may send over the socket (`MEDIA-3`). Pictures go to `POST /api/uploads`
 * and never travel in an action, so the largest message is a people import: a full one
 * (`PEOPLE_IMPORT_MAX_ROWS`, every column filled) is about 1MB. This leaves room for long values.
 *
 * The server closes the connection on a larger message without answering, so `sendAction` refuses
 * one before sending and says why.
 */
export const SOCKET_MAX_ACTION_BYTES = 3 * 1024 * 1024;
