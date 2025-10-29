import "dotenv/config";
import {
  S3Client,
  PutObjectCommand,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import path from "path";

function createS3Client() {
  const region = process.env.AWS_REGION;
  const apiKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !apiKey || !secretKey) {
    throw new Error(
      "Variáveis AWS não configuradas: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
    );
  }

  return new S3Client({
    credentials: {
      accessKeyId: apiKey,
      secretAccessKey: secretKey,
    },
    region: region,
  });
}

export async function uploadFileToS3(
  file: Buffer,
  fileName: string,
  uploadPath: string
): Promise<string> {
  const bucketName = process.env.AWS_S3_BUCKET_NAME;
  const region = process.env.AWS_REGION;

  if (!bucketName) {
    throw new Error(
      "AWS_S3_BUCKET_NAME não está definido nas variáveis de ambiente"
    );
  }
  if (!region) {
    throw new Error("AWS_REGION não está definido nas variáveis de ambiente");
  }

  const s3 = createS3Client();

  const extension = path.extname(fileName);
  const newFileName = `${uuidv4()}${extension}`;

  const params: PutObjectCommandInput = {
    Bucket: bucketName,
    Key: `${uploadPath}/${newFileName}`,
    Body: file,
    ContentType: "application/pdf",
  };

  try {
    const command = new PutObjectCommand(params);
    await s3.send(command);

    return `https://${bucketName}.s3.${region}.amazonaws.com/${uploadPath}/${newFileName}`;
  } catch (err) {
    throw new Error(`Erro ao fazer upload para S3: ${(err as Error).message}`);
  }
}
