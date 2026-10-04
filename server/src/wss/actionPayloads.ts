import Ajv, { ErrorObject, ValidateFunction } from 'ajv';
import generated from './actionPayloads.schema.json';

/**
 * The runtime check of every action's payload against its type (`SYNC-6`).
 *
 * The payload types in `@sk/shared` exist only at compile time; what arrives on the socket is
 * whatever the sender put there — an older app build, a script, a crafted message. Before this,
 * each manager coped with missing, mistyped or extra fields on its own, or crashed (`VENUE-7`).
 *
 * The schemas are generated from those same types (`scripts/gen-action-schemas.js`), so there is
 * one definition. A payload is refused when it has a field its type does not name, a field of the
 * wrong type, or lacks a required one; an action with no payload type is refused outright.
 */

const ajv = new Ajv({ strict: false });
const actions = generated.actions as Record<string, object>;
const compiled = new Map<string, ValidateFunction>();

/** Where in the payload the problem is, as a reader would write it: `data.address.latitude`. */
function where(error: ErrorObject): string {
    const path = error.instancePath.split('/').filter(Boolean).join('.');
    return path || 'the payload';
}

function describe(error: ErrorObject): string {
    switch (error.keyword) {
        case 'additionalProperties':
            return `${where(error)} has a field the server does not take: ${error.params.additionalProperty}`;
        case 'required':
            return `${where(error)} is missing ${error.params.missingProperty}`;
        case 'type':
            return `${where(error)} must be ${error.params.type}`;
        case 'enum':
            return `${where(error)} must be one of ${(error.params.allowedValues as unknown[]).join(', ')}`;
        default:
            return `${where(error)} ${error.message}`;
    }
}

/**
 * `null` when `payload` is what action `type` takes, otherwise what is wrong with it, for the
 * refusal. Each action's validator is compiled the first time it is used.
 */
export function payloadProblem(type: string, payload: unknown): string | null {
    if (!Object.prototype.hasOwnProperty.call(actions, type)) return `The server does not take ${type}.`;
    let validate = compiled.get(type);
    if (!validate) {
        validate = ajv.compile(actions[type]);
        compiled.set(type, validate);
    }
    if (validate(payload)) return null;
    return `This request was not in the form the server expects (${type}: ${describe(validate.errors![0])}).`;
}
