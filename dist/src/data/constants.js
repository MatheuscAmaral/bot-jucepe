"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BOT_SPEED_CONFIG = void 0;
exports.BOT_SPEED_CONFIG = {
    ACTION_DELAY: {
        MIN: 100,
        MAX: 300,
    },
    TYPING_SPEED: {
        FAST: { MIN: 10, MAX: 25 },
        NORMAL: { MIN: 15, MAX: 40 },
        SLOW: { MIN: 30, MAX: 150 },
    },
    SPECIAL_DELAYS: {
        PAGE_LOAD: { MIN: 2000, MAX: 3000 },
        IMPORTANT_CLICK: { MIN: 300, MAX: 800 },
        FINAL_SUBMIT: { MIN: 8000, MAX: 12000 },
    },
};
//# sourceMappingURL=constants.js.map