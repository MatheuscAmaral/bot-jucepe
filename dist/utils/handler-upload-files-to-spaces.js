"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadFileToS3 = uploadFileToS3;
require("dotenv/config");
const client_s3_1 = require("@aws-sdk/client-s3");
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
function createS3Client() {
    const region = process.env.AWS_REGION;
    const apiKey = process.env.AWS_ACCESS_KEY_ID;
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
    if (!region || !apiKey || !secretKey) {
        throw new Error("Variáveis AWS não configuradas: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY");
    }
    return new client_s3_1.S3Client({
        credentials: {
            accessKeyId: apiKey,
            secretAccessKey: secretKey,
        },
        region: region,
    });
}
async function uploadFileToS3(file, fileName, uploadPath) {
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    const region = process.env.AWS_REGION;
    if (!bucketName) {
        throw new Error("AWS_S3_BUCKET_NAME não está definido nas variáveis de ambiente");
    }
    if (!region) {
        throw new Error("AWS_REGION não está definido nas variáveis de ambiente");
    }
    const s3 = createS3Client();
    const extension = path_1.default.extname(fileName);
    const newFileName = `${(0, uuid_1.v4)()}${extension}`;
    const params = {
        Bucket: bucketName,
        Key: `${uploadPath}/${newFileName}`,
        Body: file,
        ContentType: "application/pdf",
    };
    try {
        const command = new client_s3_1.PutObjectCommand(params);
        await s3.send(command);
        return `https://${bucketName}.s3.${region}.amazonaws.com/${uploadPath}/${newFileName}`;
    }
    catch (err) {
        throw new Error(`Erro ao fazer upload para S3: ${err.message}`);
    }
}
//# sourceMappingURL=handler-upload-files-to-spaces.js.map