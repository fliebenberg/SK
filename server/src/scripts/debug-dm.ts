
import { dataManager } from "../DataManager";
import { eventManager } from "../managers/EventManager";

async function test() {
    console.log("Testing DataManager...");
    try {
        if (typeof dataManager.getLiveGames === 'function') {
            console.log("dataManager.getLiveGames exists!");
        } else {
            console.error("dataManager.getLiveGames MISSING");
        }

        if (typeof eventManager.getLiveGames === 'function') {
            console.log("eventManager.getLiveGames exists!");
        } else {
            console.error("eventManager.getLiveGames MISSING");
        }

    } catch (e) {
        console.error(e);
    }
}

test();
