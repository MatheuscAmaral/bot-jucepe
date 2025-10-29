"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const winston_1 = __importDefault(require("winston"));
const customFormat = {
    transform: (info, opts) => {
        const formatter = (_a) => {
            var { timestamp, level, message } = _a, metadata = __rest(_a, ["timestamp", "level", "message"]);
            const msg = { value: `[${timestamp}] [${level}]: ${message}` };
            if (metadata.duration) {
                msg.value += ` (${metadata.duration}ms)`;
            }
            if (metadata.error && metadata.error.stack) {
                msg.value += `\n${metadata.error.stack}`;
            }
            return msg;
        };
        const msgObj = formatter(info);
        info[Symbol.for('message')] = msgObj.value;
        return info;
    }
};
const logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.splat(), winston_1.default.format.json()),
    defaultMeta: { service: 'jucepe-automation' },
    transports: [
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), customFormat)
        })
    ]
});
exports.default = logger;
//# sourceMappingURL=Logger.js.map